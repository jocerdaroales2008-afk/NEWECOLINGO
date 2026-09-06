import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ChangeEvent,
} from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  RefreshCw,
  SwitchCamera,
  Volume2,
  X,
} from 'lucide-react';
import { useAccessibility } from '@/context/AccessibilityContext';
import {
  classifyMaterial,
  createCategoryItem,
  translateVisualLabels,
} from '@/data/recyclingData';
import { getBarcodeProductEvidence } from '@/services/productBarcode';
import {
  MATERIAL_COLORS,
  MATERIAL_LABELS,
  type MaterialCategory,
  type MaterialClassification,
  type RecyclingItem,
} from '@/types';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as tf from '@tensorflow/tfjs';

type ScanPhase = 'idle' | 'camera' | 'scanning' | 'result';
type FacingMode = 'environment' | 'user';
type EvidenceSource = 'barcode' | 'vision' | null;

type MobileNetPrediction = {
  className: string;
  probability: number;
};

const CATEGORIES: readonly MaterialCategory[] = [
  'organico',
  'papel',
  'plastico',
  'vidrio',
  'metal',
  'raee',
  'pilas',
  'textil',
  'peligroso',
];

const ANALYSIS_TIMEOUT_MS = 20_000;
const CAMERA_WIDTH = 1280;
const CAMERA_HEIGHT = 720;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function CameraScanner({
  onResult,
}: {
  onResult?: (item: RecyclingItem) => void;
}) {
  const { speak, stopSpeaking, isSpeaking } = useAccessibility();

  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [error, setError] = useState('');
  const [classification, setClassification] =
    useState<MaterialClassification | null>(null);
  const [selectedItem, setSelectedItem] = useState<RecyclingItem | null>(null);
  const [modelConfidence, setModelConfidence] = useState(0);
  const [evidenceSource, setEvidenceSource] =
    useState<EvidenceSource>(null);
  const [detectedProduct, setDetectedProduct] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] =
    useState<FacingMode>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<Promise<mobilenet.MobileNet> | null>(null);
  const analyzingRef = useRef(false);
  const mountedRef = useRef(true);

  const getModel = useCallback(() => {
    if (!modelRef.current) {
      modelRef.current = tf
        .ready()
        .then(() =>
          mobilenet.load({
            version: 2,
            alpha: 1,
          }),
        )
        .catch((modelError) => {
          modelRef.current = null;
          throw modelError;
        });
    }

    return modelRef.current;
  }, []);

  /**
   * Precarga MobileNet sin bloquear la interfaz.
   * Si falla, se intentará nuevamente al escanear.
   */
  useEffect(() => {
    void getModel().catch((modelError) => {
      console.warn('No se pudo precargar MobileNet:', modelError);
    });
  }, [getModel]);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;

    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignoramos errores de cleanup.
        }
      });
    }

    streamRef.current = null;
    setCameraReady(false);

    const video = videoRef.current;

    if (video) {
      try {
        video.pause();
      } catch {
        // Ignoramos errores de cleanup.
      }

      video.srcObject = null;
    }
  }, []);

  /**
   * Cleanup al desmontar.
   */
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      const stream = streamRef.current;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      stopSpeaking();
    };
  }, [stopSpeaking]);

  /**
   * Une el MediaStream con el <video> después de que React
   * realmente haya renderizado la pantalla de cámara.
   *
   * Evita el problema de algunos dispositivos donde el stream
   * se obtenía antes de que videoRef estuviera disponible,
   * provocando preview negra.
   */
  useEffect(() => {
    if (phase !== 'camera') return;

    const video = videoRef.current;
    const stream = streamRef.current;

    if (!video || !stream) return;

    video.srcObject = stream;

    const startPreview = async () => {
      try {
        await video.play();
      } catch (previewError) {
        console.error(
          'No se pudo iniciar la vista previa:',
          previewError,
        );

        if (mountedRef.current) {
          setError(
            'No se pudo iniciar la vista previa de la cámara. Prueba nuevamente o utiliza una fotografía.',
          );
        }
      }
    };

    void startPreview();
  }, [phase]);

  const startCamera = useCallback(
    async (requestedFacing: FacingMode = facingMode) => {
      setError('');
      setCameraReady(false);

      stopCamera();

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('camera-unsupported');
        }

        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: {
                ideal: requestedFacing,
              },
              width: {
                ideal: CAMERA_WIDTH,
              },
              height: {
                ideal: CAMERA_HEIGHT,
              },
            },
            audio: false,
          });

        if (!mountedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setFacingMode(requestedFacing);

        /**
         * Primero cambiamos phase.
         * El useEffect anterior conectará después el stream
         * al elemento <video>.
         */
        setPhase('camera');

        const devices =
          await navigator.mediaDevices
            .enumerateDevices()
            .catch(() => []);

        if (mountedRef.current) {
          setHasMultipleCameras(
            devices.filter(
              (device) => device.kind === 'videoinput',
            ).length > 1,
          );
        }
      } catch (requestError) {
        stopCamera();

        if (!mountedRef.current) return;

        setPhase('idle');

        const name =
          requestError instanceof DOMException
            ? requestError.name
            : '';

        if (
          name === 'NotAllowedError' ||
          name === 'PermissionDeniedError'
        ) {
          setError(
            'Permiso de cámara denegado. Habilítalo en la configuración del navegador.',
          );
        } else if (
          name === 'NotFoundError' ||
          name === 'DevicesNotFoundError'
        ) {
          setError(
            'No encontramos una cámara disponible. Puedes subir una fotografía.',
          );
        } else if (
          name === 'NotReadableError' ||
          name === 'TrackStartError'
        ) {
          setError(
            'La cámara está siendo utilizada por otra aplicación. Ciérrala e inténtalo nuevamente.',
          );
        } else {
          setError(
            'No se pudo acceder a la cámara. Puedes subir una fotografía en su lugar.',
          );
        }
      }
    },
    [facingMode, stopCamera],
  );

  const analyzeImage = useCallback(
    async (
      image: HTMLCanvasElement | HTMLImageElement,
    ) => {
      if (analyzingRef.current) return;

      analyzingRef.current = true;

      setError('');
      setClassification(null);
      setSelectedItem(null);
      setModelConfidence(0);
      setEvidenceSource(null);
      setDetectedProduct('');
      setPhase('scanning');

      try {
        /**
         * Barcode y visión se ejecutan en paralelo.
         *
         * Cada proceso tiene timeout para impedir que la UI
         * quede eternamente mostrando "Analizando material...".
         */
        const [productEvidence, visionAttempt] =
          await Promise.all([
            withTimeout(
              getBarcodeProductEvidence(image),
              ANALYSIS_TIMEOUT_MS,
              'Tiempo de espera agotado al detectar el código de barras.',
            ).catch((barcodeError) => {
              console.warn(
                'Barcode no disponible:',
                barcodeError,
              );

              return null;
            }),

            withTimeout(
              getModel().then((model) =>
                model.classify(image, 8),
              ),
              ANALYSIS_TIMEOUT_MS,
              'Tiempo de espera agotado durante el análisis visual.',
            )
              .then((predictions) => ({
                predictions,
                failed: false,
              }))
              .catch((visionError) => {
                console.error(
                  'Análisis visual falló:',
                  visionError,
                );

                return {
                  predictions: [] as MobileNetPrediction[],
                  failed: true,
                };
              }),
          ]);

        if (!mountedRef.current) return;

        const predictions = visionAttempt.predictions;

        /**
         * Traducimos únicamente predicciones que nuestra lógica
         * de reciclaje sabe interpretar.
         */
        const mapped = predictions
          .map((prediction) => ({
            prediction,
            translated: translateVisualLabels([
              prediction.className,
            ]),
          }))
          .filter(
            (
              entry,
            ): entry is typeof entry & {
              translated: string;
            } => Boolean(entry.translated),
          );

        const visualText = mapped
          .map((entry) => entry.translated)
          .join(' ');

        const visualResult =
          classifyMaterial(visualText);

        const barcodeResult = productEvidence
          ? classifyMaterial(productEvidence.materialText)
          : null;

        /**
         * MobileNet es un clasificador ImageNet genérico.
         *
         * No sumamos probabilidades entre clases porque eso
         * podría inflar artificialmente la confianza.
         */
        const mappedProbability = mapped.reduce(
          (best, entry) =>
            Math.max(
              best,
              entry.prediction.probability,
            ),
          0,
        );

        const visualConfidence =
          visualResult.item
            ? Math.min(
                visualResult.confidence,
                mappedProbability || 0,
              )
            : 0;

        let guardedResult: MaterialClassification;
        let source: EvidenceSource =
          mapped.length > 0 ? 'vision' : null;
        let displayedConfidence =
          mappedProbability;

        /**
         * PRIORIDAD 1:
         * evidencia conocida proveniente del código de barras.
         */
        if (
          barcodeResult?.item &&
          barcodeResult.status === 'confident'
        ) {
          const metadataConfidence = 0.82;

          const sameVisualCategory =
            visualResult.item?.category ===
              barcodeResult.item.category &&
            visualConfidence >= 0.45;

          const conflictingVisualCategory =
            Boolean(
              visualResult.item &&
                visualResult.item.category !==
                  barcodeResult.item.category &&
                visualConfidence >= 0.62,
            );

          source = 'barcode';
          displayedConfidence = metadataConfidence;

          if (
            conflictingVisualCategory &&
            visualResult.item
          ) {
            const categories = [
              barcodeResult.item.category,
              visualResult.item.category,
            ];

            const alternatives = categories
              .filter(
                (category, index) =>
                  categories.indexOf(category) ===
                  index,
              )
              .map((category, index) => ({
                category,
                score: 2 - index,
                label:
                  MATERIAL_LABELS[category],
              }));

            guardedResult = {
              status: 'uncertain',
              confidence: Math.max(
                metadataConfidence,
                visualConfidence,
              ),
              item: barcodeResult.item,
              alternatives,
              reason:
                'Los datos del envase y la imagen indican materiales diferentes. Confirma manualmente el material principal.',
            };
          } else {
            guardedResult = {
              ...barcodeResult,
              status: sameVisualCategory
                ? 'confident'
                : 'uncertain',
              confidence: sameVisualCategory
                ? 0.9
                : metadataConfidence,
              reason: sameVisualCategory
              ? `El código de barras y la imagen coinciden para ${productEvidence?.productName ?? 'el producto detectado'}.`
                : 'Encontramos información del envase mediante el código de barras. Confirma que corresponda al material que vas a reciclar.',
            };
          }
        }

        /**
         * PRIORIDAD 2:
         * evidencia visual suficientemente buena.
         */
        else if (
          visualConfidence >= 0.62 &&
          visualResult.item
        ) {
          guardedResult = {
            ...visualResult,
            status:
              visualConfidence >= 0.75
                ? 'confident'
                : 'uncertain',
            confidence: visualConfidence,
            reason:
              visualConfidence >= 0.75
                ? visualResult.reason ||
                  'La imagen coincide con una categoría conocida. Comprueba igualmente el material antes de reciclar.'
                : visualResult.reason ||
                  'Existe una coincidencia visual, pero necesitamos que confirmes el material.',
          };
        }

        /**
         * PRIORIDAD 3:
         * no existe evidencia fiable.
         *
         * Nunca convertimos automáticamente lo desconocido
         * en plástico u otra categoría.
         */
        else {
          guardedResult = {
            ...visualResult,
            status: visualResult.item
              ? 'uncertain'
              : 'unknown',
            confidence: visualConfidence,
            reason: visionAttempt.failed
              ? 'El modelo visual no estuvo disponible o tardó demasiado. Selecciona manualmente la categoría.'
              : visualResult.reason ||
                'No pudimos identificar el material con suficiente seguridad. Selecciona manualmente la categoría correcta.',
          };
        }

        if (!mountedRef.current) return;

        setClassification(guardedResult);

        /**
         * Solo preseleccionamos automáticamente cuando
         * realmente consideramos el resultado confiable.
         */
        setSelectedItem(
          guardedResult.status === 'confident'
            ? guardedResult.item
            : null,
        );

        setModelConfidence(displayedConfidence);
        setEvidenceSource(source);
        setDetectedProduct(
          productEvidence?.productName ?? '',
        );
        setPhase('result');
      } catch (analysisError) {
        console.error(
          'Error general analizando imagen:',
          analysisError,
        );

        if (!mountedRef.current) return;

        setError(
          'No se pudo analizar la imagen automáticamente. Puedes seleccionar el material manualmente.',
        );

        setClassification({
          status: 'unknown',
          confidence: 0,
          item: null,
          alternatives: [],
          reason:
            'Clasificación automática no disponible. Selecciona manualmente el material.',
        });

        setSelectedItem(null);
        setModelConfidence(0);
        setEvidenceSource(null);
        setDetectedProduct('');
        setPhase('result');
      } finally {
        analyzingRef.current = false;
      }
    },
    [getModel],
  );

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (analyzingRef.current) return;

    if (
      !video ||
      !canvas ||
      !cameraReady ||
      video.videoWidth < 2 ||
      video.videoHeight < 2
    ) {
      setError(
        'La cámara todavía no está lista. Espera un instante y vuelve a intentarlo.',
      );
      return;
    }

    /**
     * Limitamos la resolución de análisis.
     *
     * No necesitamos analizar una foto de 4K/8K.
     * Esto reduce memoria y evita bloqueos especialmente
     * en teléfonos con poca RAM.
     */
    const maxDimension = 1280;

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;

    const scale = Math.min(
      1,
      maxDimension /
        Math.max(sourceWidth, sourceHeight),
    );

    canvas.width = Math.round(
      sourceWidth * scale,
    );
    canvas.height = Math.round(
      sourceHeight * scale,
    );

    const context = canvas.getContext('2d', {
      alpha: false,
    });

    if (!context) {
      setError(
        'No se pudo preparar la imagen para el análisis.',
      );
      return;
    }

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    /**
     * Cerramos la cámara inmediatamente para evitar mantener
     * cámara + TensorFlow + canvas activos al mismo tiempo.
     */
    stopCamera();

    await analyzeImage(canvas);
  }, [
    analyzeImage,
    cameraReady,
    stopCamera,
  ]);

  const handleGalleryImage = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    /**
     * Permite seleccionar posteriormente el mismo archivo.
     */
    event.target.value = '';

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError(
        'Selecciona un archivo de imagen válido.',
      );
      return;
    }

    /**
     * Evita imágenes excesivamente grandes que pueden consumir
     * demasiada memoria en teléfonos.
     */
    const MAX_FILE_SIZE = 15 * 1024 * 1024;

    if (file.size > MAX_FILE_SIZE) {
      setError(
        'La fotografía es demasiado grande. Selecciona una imagen menor de 15 MB.',
      );
      return;
    }

    setError('');

    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = async () => {
      try {
        await analyzeImage(image);
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);

      if (!mountedRef.current) return;

      setError(
        'No se pudo leer esa fotografía.',
      );
      setPhase('idle');
    };

    image.src = url;
  };

  const selectCategory = (
    category: MaterialCategory,
  ) => {
    setSelectedItem(
      createCategoryItem(category),
    );
  };

  const confirmResult = () => {
    if (!selectedItem) return;

    onResult?.(selectedItem);
    reset();
  };

  const speakResult = () => {
    if (!selectedItem) return;

    const availableSteps =
      selectedItem.steps
        .filter(Boolean)
        .slice(0, 3)
        .map(
          (step, index) =>
            `Paso ${index + 1}: ${step}`,
        )
        .join(' ');

    speak(
      `${selectedItem.name}. ${availableSteps}`,
    );
  };

  const reset = () => {
    analyzingRef.current = false;

    stopCamera();
    stopSpeaking();

    setClassification(null);
    setSelectedItem(null);
    setModelConfidence(0);
    setEvidenceSource(null);
    setDetectedProduct('');
    setError('');
    setCameraReady(false);
    setPhase('idle');
  };

  const close = () => {
    reset();
  };

  /**
   * Guardamos la referencia en una constante para que
   * TypeScript pueda tratarla correctamente dentro de callbacks.
   */
  const suggestedItem =
    classification?.item ?? null;

  if (phase === 'idle') {
    return (
      <div className="eco-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-forest-100 text-forest-700 dark:bg-forest-900 dark:text-forest-300">
          <Camera size={24} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-bold">
            Escáner asistido
          </p>

          <p className="text-sm text-[var(--eco-text-muted)]">
            La IA propone una categoría y tú
            confirmas cuando exista duda.
          </p>

          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() =>
              void startCamera()
            }
            className="eco-btn"
          >
            <Camera size={18} />
            Cámara
          </button>

          <label className="eco-btn-outline cursor-pointer">
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={handleGalleryImage}
            />
            <ImagePlus size={18} />
            Foto
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 sm:p-4">
      <div className="my-auto w-full max-w-xl animate-scale-in overflow-hidden rounded-2xl bg-[var(--eco-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--eco-border)] p-4">
          <h2 className="font-extrabold">
            Escáner de residuos
          </h2>

          <button
            type="button"
            onClick={close}
            className="rounded-lg p-2 hover:bg-[var(--eco-surface)]"
            aria-label="Cerrar escáner"
          >
            <X size={20} />
          </button>
        </div>

        {phase === 'camera' && (
          <div className="p-4">
            {error && (
              <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </p>
            )}

            <div className="relative overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                onLoadedMetadata={() => {
                  const video =
                    videoRef.current;

                  if (
                    video &&
                    video.videoWidth > 1 &&
                    video.videoHeight > 1
                  ) {
                    setCameraReady(true);
                  }
                }}
                onCanPlay={() => {
                  const video =
                    videoRef.current;

                  if (
                    video &&
                    video.videoWidth > 1 &&
                    video.videoHeight > 1
                  ) {
                    setCameraReady(true);
                  }
                }}
                className="h-[min(56dvh,420px)] w-full object-cover"
                playsInline
                autoPlay
                muted
              />

              <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-dashed border-white/80" />

              <div className="absolute bottom-3 left-1/2 w-max max-w-[90%] -translate-x-1/2 rounded-full bg-black/65 px-3 py-1.5 text-center text-xs text-white">
                Centra un solo residuo y evita
                fondos muy cargados
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              {hasMultipleCameras && (
                <button
                  type="button"
                  onClick={() =>
                    void startCamera(
                      facingMode ===
                        'environment'
                        ? 'user'
                        : 'environment',
                    )
                  }
                  className="eco-btn-outline"
                  aria-label="Cambiar cámara"
                >
                  <SwitchCamera size={20} />
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  void capturePhoto()
                }
                disabled={!cameraReady}
                className="eco-btn flex-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Camera size={20} />

                {cameraReady
                  ? 'Tomar foto'
                  : 'Preparando cámara...'}
              </button>
            </div>
          </div>
        )}

        {phase === 'scanning' && (
          <div
            className="flex flex-col items-center justify-center p-12"
            role="status"
            aria-live="polite"
          >
            <Loader2
              className="mb-4 animate-spin text-forest-600"
              size={40}
            />

            <p className="font-semibold text-[var(--eco-text-muted)]">
              Analizando material...
            </p>

            <p className="mt-2 max-w-sm text-center text-xs text-[var(--eco-text-muted)]">
              La clasificación visual es una
              ayuda. Si la IA tiene dudas,
              podrás seleccionar manualmente
              el material.
            </p>
          </div>
        )}

        {phase === 'result' && (
          <div className="max-h-[78dvh] overflow-y-auto p-5">
            <div
              className={`mb-4 rounded-xl p-4 ${
                classification?.status ===
                'confident'
                  ? 'bg-forest-50 dark:bg-forest-950'
                  : 'bg-amber-50 dark:bg-amber-950/40'
              }`}
            >
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-600 text-white">
                  {classification?.status ===
                  'confident' ? (
                    <Check size={22} />
                  ) : (
                    <AlertTriangle
                      size={22}
                    />
                  )}
                </span>

                <div className="min-w-0">
                  <p className="font-extrabold">
                    {classification?.status ===
                    'confident'
                      ? 'Coincidencia probable'
                      : classification?.status ===
                          'unknown'
                        ? 'Material no identificado'
                        : 'Necesitamos tu confirmación'}
                  </p>

                  <p className="mt-1 text-sm text-[var(--eco-text-muted)]">
                    {classification?.reason ||
                      'Revisa que la categoría coincida con el material real del producto.'}
                  </p>

                  {detectedProduct && (
                    <p className="mt-1 text-xs font-semibold text-[var(--eco-text-muted)]">
                      Producto:{' '}
                      {detectedProduct}
                    </p>
                  )}

                  {modelConfidence > 0 && (
                    <p className="mt-1 text-xs text-[var(--eco-text-muted)]">
                      {evidenceSource ===
                      'barcode'
                        ? 'Confianza de metadata del envase'
                        : 'Mejor evidencia visual'}
                      :{' '}
                      {Math.round(
                        modelConfidence *
                          100,
                      )}
                      %
                    </p>
                  )}
                </div>
              </div>
            </div>

            {suggestedItem && (
              <button
                type="button"
                onClick={() =>
                  setSelectedItem(
                    suggestedItem,
                  )
                }
                className={`mb-4 w-full rounded-xl border-2 p-4 text-left ${
                  selectedItem?.category ===
                  suggestedItem.category
                    ? 'border-forest-600 bg-forest-50 dark:bg-forest-950'
                    : 'border-[var(--eco-border)]'
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-forest-600 dark:text-forest-400">
                  Sugerencia de la IA
                </p>

                <p className="text-lg font-extrabold">
                  {
                    MATERIAL_LABELS[
                      suggestedItem.category
                    ]
                  }
                </p>

                <p className="text-xs text-[var(--eco-text-muted)]">
                  Confianza combinada:{' '}
                  {Math.round(
                    (classification?.confidence ??
                      0) * 100,
                  )}
                  %
                </p>
              </button>
            )}

            <p className="mb-2 text-sm font-bold">
              Confirma el tipo de material:
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CATEGORIES.map(
                (category) => {
                  const isSelected =
                    selectedItem?.category ===
                    category;

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() =>
                        selectCategory(
                          category,
                        )
                      }
                      className={`min-h-12 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
                        isSelected
                          ? 'border-forest-600 bg-forest-50 dark:bg-forest-950'
                          : 'border-[var(--eco-border)] hover:bg-[var(--eco-surface)]'
                      }`}
                      style={
                        isSelected
                          ? {
                              color:
                                MATERIAL_COLORS[
                                  category
                                ],
                            }
                          : undefined
                      }
                      aria-pressed={
                        isSelected
                      }
                    >
                      {
                        MATERIAL_LABELS[
                          category
                        ]
                      }
                    </button>
                  );
                },
              )}
            </div>

            {selectedItem && (
              <div className="mt-4 rounded-xl bg-[var(--eco-surface)] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-forest-600 dark:text-forest-400">
                  Categoría seleccionada
                </p>

                <h3 className="text-lg font-extrabold">
                  {
                    MATERIAL_LABELS[
                      selectedItem.category
                    ]
                  }
                </h3>

                <div className="mt-3 space-y-2">
                  {selectedItem.steps.map(
                    (step, index) => (
                      <p
                        key={`${index}-${step}`}
                        className="text-sm text-[var(--eco-text-muted)]"
                      >
                        <strong>
                          {index + 1}.
                        </strong>{' '}
                        {step}
                      </p>
                    ),
                  )}
                </div>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={speakResult}
                disabled={!selectedItem}
                className="eco-btn-outline disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Volume2 size={18} />
                {isSpeaking
                  ? 'Reproduciendo...'
                  : 'Escuchar'}
              </button>

              <button
                type="button"
                onClick={confirmResult}
                disabled={!selectedItem}
                className="eco-btn disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check size={18} />
                Confirmar
              </button>

              <button
                type="button"
                onClick={reset}
                className="eco-btn-outline"
              >
                <RefreshCw size={18} />
                Otro
              </button>
            </div>
          </div>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className="hidden"
      />
    </div>
  );
}