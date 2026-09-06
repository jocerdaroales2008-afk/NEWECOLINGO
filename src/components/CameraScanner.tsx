import { useState, useRef, useCallback, useEffect, type ChangeEvent } from 'react';
import { AlertTriangle, Camera, Check, ImagePlus, Loader2, RefreshCw, SwitchCamera, Volume2, X } from 'lucide-react';
import { useAccessibility } from '@/context/AccessibilityContext';
import { classifyMaterial, createCategoryItem, translateVisualLabels } from '@/data/recyclingData';
import { getBarcodeProductEvidence } from '@/services/productBarcode';
import {
  MATERIAL_COLORS,
  MATERIAL_LABELS,
  type MaterialCategory,
  type MaterialClassification,
  type RecyclingItem,
} from '@/types';
import * as mobilenet from '@tensorflow-models/mobilenet';
import '@tensorflow/tfjs';

type ScanPhase = 'idle' | 'camera' | 'scanning' | 'result';
type FacingMode = 'environment' | 'user';
type EvidenceSource = 'barcode' | 'vision' | null;

export function CameraScanner({ onResult }: { onResult?: (item: RecyclingItem) => void }) {
  const { speak, stopSpeaking, isSpeaking } = useAccessibility();
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [error, setError] = useState('');
  const [classification, setClassification] = useState<MaterialClassification | null>(null);
  const [selectedItem, setSelectedItem] = useState<RecyclingItem | null>(null);
  const [modelConfidence, setModelConfidence] = useState(0);
  const [evidenceSource, setEvidenceSource] = useState<EvidenceSource>(null);
  const [detectedProduct, setDetectedProduct] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<Promise<mobilenet.MobileNet> | null>(null);
  const analyzingRef = useRef(false);

  const getModel = useCallback(() => {
    if (!modelRef.current) modelRef.current = mobilenet.load({ version: 2, alpha: 1 });
    return modelRef.current;
  }, []);

  useEffect(() => {
    void getModel().catch(() => {
      modelRef.current = null;
    });
  }, [getModel]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => {
    stopCamera();
    stopSpeaking();
  }, [stopCamera, stopSpeaking]);

  const startCamera = useCallback(async (requestedFacing: FacingMode = facingMode) => {
    setError('');
    setCameraReady(false);
    stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: requestedFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setFacingMode(requestedFacing);
      setPhase('camera');

      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      setHasMultipleCameras(devices.filter((device) => device.kind === 'videoinput').length > 1);

      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video || streamRef.current !== stream) return;
        video.srcObject = stream;
        void video.play().catch(() => setError('No se pudo iniciar la vista previa de la cámara.'));
      });
    } catch (requestError) {
      stopCamera();
      setPhase('idle');
      const name = requestError instanceof DOMException ? requestError.name : '';
      setError(name === 'NotAllowedError'
        ? 'Permiso de cámara denegado. Habilítalo en la configuración del navegador.'
        : 'No se pudo acceder a la cámara. Puedes subir una fotografía en su lugar.');
    }
  }, [facingMode, stopCamera]);

  const analyzeImage = useCallback(async (image: HTMLCanvasElement | HTMLImageElement) => {
    if (analyzingRef.current) return;
    analyzingRef.current = true;
    setError('');
    setPhase('scanning');
    try {
      const [productEvidence, visionAttempt] = await Promise.all([
        getBarcodeProductEvidence(image),
        getModel()
          .then((model) => model.classify(image, 8))
          .then((predictions) => ({ predictions, failed: false }))
          .catch(() => ({ predictions: [], failed: true })),
      ]);
      const predictions = visionAttempt.predictions;

      const mapped = predictions
        .map((prediction) => ({
          prediction,
          translated: translateVisualLabels([prediction.className]),
        }))
        .filter((entry) => entry.translated);

      const visualText = mapped.map((entry) => entry.translated).join(' ');
      const visualResult = classifyMaterial(visualText);
      const barcodeResult = productEvidence ? classifyMaterial(productEvidence.materialText) : null;

      // MobileNet no está calibrado para residuos: usamos solo la mejor evidencia mapeable,
      // nunca la suma de probabilidades, para evitar inflar artificialmente la confianza.
      const mappedProbability = mapped.reduce((best, entry) => Math.max(best, entry.prediction.probability), 0);
      const visualConfidence = visualResult.item
        ? Math.min(visualResult.confidence, mappedProbability || 0)
        : 0;

      let guardedResult: MaterialClassification;
      let source: EvidenceSource = 'vision';
      let displayedConfidence = mappedProbability;

      if (barcodeResult?.item && barcodeResult.status === 'confident') {
        const metadataConfidence = 0.82;
        const sameVisualCategory = visualResult.item?.category === barcodeResult.item.category && visualConfidence >= 0.45;
        const conflictingVisualCategory = Boolean(
          visualResult.item
          && visualResult.item.category !== barcodeResult.item.category
          && visualConfidence >= 0.62,
        );

        source = 'barcode';
        displayedConfidence = metadataConfidence;

        if (conflictingVisualCategory && visualResult.item) {
          const categories = [barcodeResult.item.category, visualResult.item.category];
          const alternatives = categories
            .filter((category, index) => categories.indexOf(category) === index)
            .map((category, index) => ({ category, score: 2 - index, label: MATERIAL_LABELS[category] }));
          guardedResult = {
            status: 'uncertain',
            confidence: Math.max(metadataConfidence, visualConfidence),
            item: barcodeResult.item,
            alternatives,
            reason: 'Los metadatos del envase y la imagen no coinciden. Confirma manualmente el material principal.',
          };
        } else {
          guardedResult = {
            ...barcodeResult,
            status: sameVisualCategory ? 'confident' : 'uncertain',
            confidence: sameVisualCategory ? 0.9 : metadataConfidence,
            reason: sameVisualCategory
              ? `El código de barras y la evidencia visual coinciden para ${productEvidence.productName}.`
              : 'Encontramos información del envase por código de barras. Confirma que corresponda al material que vas a reciclar.',
          };
        }
      } else if (visualConfidence >= 0.62 && visualResult.item) {
        guardedResult = {
          ...visualResult,
          status: visualConfidence >= 0.75 ? 'confident' : 'uncertain',
          confidence: visualConfidence,
        };
      } else {
        guardedResult = {
          ...visualResult,
          status: visualResult.item ? 'uncertain' : 'unknown',
          confidence: visualConfidence,
          reason: visionAttempt.failed
            ? 'El modelo visual no estuvo disponible. Si el producto tiene código de barras intenta otra foto, o confirma la categoría manualmente.'
            : visualResult.reason || 'El modelo visual genérico no identificó el material con suficiente seguridad. Confirma la categoría manualmente.',
        };
      }

      setClassification(guardedResult);
      setSelectedItem(guardedResult.status === 'confident' ? guardedResult.item : null);
      setModelConfidence(displayedConfidence);
      setEvidenceSource(source);
      setDetectedProduct(productEvidence?.productName ?? '');
      setPhase('result');
    } catch {
      setError('No se pudo analizar la imagen. El modelo puede requerir conexión la primera vez. Inténtalo nuevamente o clasifica manualmente.');
      setClassification({ status: 'unknown', confidence: 0, item: null, alternatives: [], reason: 'Clasificación visual no disponible.' });
      setSelectedItem(null);
      setModelConfidence(0);
      setEvidenceSource(null);
      setDetectedProduct('');
      setPhase('result');
    } finally {
      analyzingRef.current = false;
    }
  }, [getModel]);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady || video.videoWidth < 2 || video.videoHeight < 2 || analyzingRef.current) {
      setError('La cámara todavía no está lista. Espera un instante y vuelve a intentarlo.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('No se pudo preparar la imagen para el análisis.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    stopCamera();
    await analyzeImage(canvas);
  }, [analyzeImage, cameraReady, stopCamera]);

  const handleGalleryImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen válido.');
      return;
    }

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
      setError('No se pudo leer esa fotografía.');
      setPhase('idle');
    };
    image.src = url;
  };

  const selectCategory = (category: MaterialCategory) => {
    setSelectedItem(createCategoryItem(category));
  };

  const confirmResult = () => {
    if (!selectedItem) return;
    onResult?.(selectedItem);
    reset();
  };

  const speakResult = () => {
    if (!selectedItem) return;
    speak(`${selectedItem.name}. Paso 1: ${selectedItem.steps[0]} Paso 2: ${selectedItem.steps[1]} Paso 3: ${selectedItem.steps[2]}`);
  };

  const reset = () => {
    stopCamera();
    stopSpeaking();
    setClassification(null);
    setSelectedItem(null);
    setModelConfidence(0);
    setEvidenceSource(null);
    setDetectedProduct('');
    setError('');
    setPhase('idle');
  };

  const close = () => reset();

  if (phase === 'idle') {
    return (
      <div className="eco-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-forest-100 text-forest-700 dark:bg-forest-900 dark:text-forest-300"><Camera size={24} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Escáner asistido</p>
          <p className="text-sm text-[var(--eco-text-muted)]">La IA propone una categoría y tú confirmas cuando exista duda.</p>
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button onClick={() => void startCamera()} className="eco-btn"><Camera size={18} /> Cámara</button>
          <label className="eco-btn-outline cursor-pointer"><input className="sr-only" type="file" accept="image/*" onChange={handleGalleryImage} /><ImagePlus size={18} /> Foto</label>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 sm:p-4">
      <div className="my-auto w-full max-w-xl animate-scale-in overflow-hidden rounded-2xl bg-[var(--eco-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--eco-border)] p-4">
          <h2 className="font-extrabold">Escáner de residuos</h2>
          <button onClick={close} className="rounded-lg p-2 hover:bg-[var(--eco-surface)]" aria-label="Cerrar escáner"><X size={20} /></button>
        </div>

        {phase === 'camera' && (
          <div className="p-4">
            {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} onLoadedMetadata={() => setCameraReady(true)} className="h-[min(56dvh,420px)] w-full object-cover" playsInline muted />
              <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-dashed border-white/80" />
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1.5 text-center text-xs text-white">Centra un solo residuo y evita fondos muy cargados</div>
            </div>
            <div className="mt-4 flex gap-2">
              {hasMultipleCameras && (
                <button onClick={() => void startCamera(facingMode === 'environment' ? 'user' : 'environment')} className="eco-btn-outline" aria-label="Cambiar cámara"><SwitchCamera size={20} /></button>
              )}
              <button onClick={() => void capturePhoto()} disabled={!cameraReady} className="eco-btn flex-1 disabled:cursor-not-allowed disabled:opacity-50"><Camera size={20} /> {cameraReady ? 'Tomar foto' : 'Preparando cámara...'}</button>
            </div>
          </div>
        )}

        {phase === 'scanning' && (
          <div className="flex flex-col items-center justify-center p-12">
            <Loader2 className="mb-4 animate-spin text-forest-600" size={40} />
            <p className="font-semibold text-[var(--eco-text-muted)]">Analizando material...</p>
            <p className="mt-2 max-w-sm text-center text-xs text-[var(--eco-text-muted)]">La clasificación visual es una ayuda; las predicciones inciertas requieren confirmación.</p>
          </div>
        )}

        {phase === 'result' && (
          <div className="max-h-[78dvh] overflow-y-auto p-5">
            <div className={`mb-4 rounded-xl p-4 ${classification?.status === 'confident' ? 'bg-forest-50 dark:bg-forest-950' : 'bg-amber-50 dark:bg-amber-950/40'}`}>
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-600 text-white">
                  {classification?.status === 'confident' ? <Check size={22} /> : <AlertTriangle size={22} />}
                </span>
                <div>
                  <p className="font-extrabold">{classification?.status === 'confident' ? 'Coincidencia probable' : 'Necesitamos tu confirmación'}</p>
                  <p className="mt-1 text-sm text-[var(--eco-text-muted)]">{classification?.reason || 'Revisa que la categoría coincida con el material real del producto.'}</p>
                  {detectedProduct && <p className="mt-1 text-xs font-semibold text-[var(--eco-text-muted)]">Producto: {detectedProduct}</p>}
                  {modelConfidence > 0 && (
                    <p className="mt-1 text-xs text-[var(--eco-text-muted)]">
                      {evidenceSource === 'barcode' ? 'Confianza de metadata de envase' : 'Mejor evidencia visual mapeable'}: {Math.round(modelConfidence * 100)}%
                    </p>
                  )}
                </div>
              </div>
            </div>

            {classification?.item && (
              <button onClick={() => setSelectedItem(classification.item)} className={`mb-4 w-full rounded-xl border-2 p-4 text-left ${selectedItem?.category === classification.item.category ? 'border-forest-600' : 'border-[var(--eco-border)]'}`}>
                <p className="text-xs font-bold uppercase tracking-wider text-forest-600 dark:text-forest-400">Sugerencia de la IA</p>
                <p className="text-lg font-extrabold">{MATERIAL_LABELS[classification.item.category]}</p>
                <p className="text-xs text-[var(--eco-text-muted)]">Confianza combinada: {Math.round(classification.confidence * 100)}%</p>
              </button>
            )}

            <p className="mb-2 text-sm font-bold">Confirma el tipo de material:</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => selectCategory(category)}
                  className={`min-h-12 rounded-xl border-2 px-3 py-2 text-sm font-semibold ${selectedItem?.category === category ? 'border-forest-600 bg-forest-50 dark:bg-forest-950' : 'border-[var(--eco-border)]'}`}
                  style={selectedItem?.category === category ? { color: MATERIAL_COLORS[category] } : undefined}
                >
                  {MATERIAL_LABELS[category]}
                </button>
              ))}
            </div>

            {selectedItem && (
              <div className="mt-4 rounded-xl bg-[var(--eco-surface)] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-forest-600 dark:text-forest-400">Categoría seleccionada</p>
                <h3 className="text-lg font-extrabold">{MATERIAL_LABELS[selectedItem.category]}</h3>
                <div className="mt-3 space-y-2">
                  {selectedItem.steps.map((step, index) => <p key={step} className="text-sm text-[var(--eco-text-muted)]"><strong>{index + 1}.</strong> {step}</p>)}
                </div>
              </div>
            )}

            {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button onClick={speakResult} disabled={!selectedItem} className="eco-btn-outline disabled:opacity-50"><Volume2 size={18} /> {isSpeaking ? 'Reproduciendo...' : 'Escuchar'}</button>
              <button onClick={confirmResult} disabled={!selectedItem} className="eco-btn disabled:opacity-50"><Check size={18} /> Confirmar</button>
              <button onClick={reset} className="eco-btn-outline"><RefreshCw size={18} /> Otro</button>
            </div>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
