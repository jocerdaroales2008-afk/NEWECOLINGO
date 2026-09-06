import { MATERIAL_LABELS, type MaterialCategory, type MaterialGuide, type RecyclingItem } from '@/types';

export const RECYCLING_ITEMS: RecyclingItem[] = [
  {
    id: 'botella-plastico',
    name: 'Botella de plástico',
    category: 'plastico',
    keywords: ['botella', 'plastico', 'pet', 'botella pet', 'botella de plastico', 'botella de agua', 'gaseosa'],
    steps: [
      'Vacía el contenido por completo y retira tapas y etiquetas.',
      'Enjuaga con un poco de agua y deja secar al aire.',
      'Aplasta la botella para reducir su volumen y vuelve a colocar la tapa.',
    ],
    tip: 'Las botellas PET son 100% reciclables. Una botella puede tardar hasta 500 años en descomponerse si no se recicla.',
    icon: 'bottle',
  },
  {
    id: 'botella-vidrio',
    name: 'Botella de vidrio',
    category: 'vidrio',
    keywords: ['botella de vidrio', 'vidrio', 'frasco', 'tarro de vidrio'],
    steps: [
      'Vacía el contenido por completo y retira tapas metálicas o de corcho.',
      'Enjuaga con agua para eliminar restos de alimentos o bebidas.',
      'No es necesario aplastar. Entrega intacta en el punto limpio.',
    ],
    tip: 'El vidrio es 100% reciclable y puede reciclarse infinitas veces sin perder calidad.',
    icon: 'wine',
  },
  {
    id: 'tetrapak',
    name: 'Tetra Pak / Caja de leche',
    category: 'papel',
    keywords: ['tetrapak', 'tetra pak', 'caja de leche', 'cartón de leche', 'tetra brik'],
    steps: [
      'Vacía el contenido por completo.',
      'Enjuaga con un poco de agua y deja secar.',
      'Aplasta para reducir el espacio que ocupa.',
    ],
    tip: 'El Tetra Pak está hecho de cartón, plástico y aluminio. Se recicla por separado en plantas especializadas.',
    icon: 'box',
  },
  {
    id: 'carton',
    name: 'Caja de cartón',
    category: 'papel',
    keywords: ['carton', 'caja', 'caja de carton', 'cartón corrugado'],
    steps: [
      'Retira cintas adhesivas, etiquetas y grapas del cartón.',
      'Asegúrate de que esté seco y limpio, sin restos de comida o grasa.',
      'Desarma y aplasta las cajas para reducir su volumen.',
    ],
    tip: 'El cartón se recicla hasta 7 veces. Mantenlo siempre seco, el cartón húmedo no se puede reciclar.',
    icon: 'package',
  },
  {
    id: 'papel',
    name: 'Papel',
    category: 'papel',
    keywords: ['papel', 'hojas', 'revista', 'periodico', 'periódico', 'cuaderno'],
    steps: [
      'Asegúrate de que el papel esté limpio y seco, sin restos de grasa o comida.',
      'Retira grapas, clips y espirales metálicas.',
      'Apila y ata el papel o colócalo en una bolsa para transportarlo.',
    ],
    tip: 'Reciclar 1 tonelada de papel salva aproximadamente 17 árboles y ahorra 26,000 litros de agua.',
    icon: 'file-text',
  },
  {
    id: 'lata-metal',
    name: 'Lata de metal',
    category: 'metal',
    keywords: ['lata', 'metal', 'aluminio', 'lata de atun', 'lata de bebida', 'conserva'],
    steps: [
      'Vacía el contenido por completo y enjuaga con agua.',
      'Verifica que no queden restos de comida o líquidos.',
      'Aplasta la lata para reducir su volumen y evita cortes en los bordes.',
    ],
    tip: 'Una lata de aluminio reciclada ahorra suficiente energía como para mantener un televisor encendido durante 3 horas.',
    icon: 'disc',
  },
  {
    id: 'pila',
    name: 'Pilas y baterías',
    category: 'pilas',
    keywords: ['pila', 'pilas', 'pila aa', 'pila aaa', 'bateria', 'batería', 'baterias', 'bateria aa', 'bateria aaa', 'pilas alcalinas'],
    steps: [
      'Recolecta las pilas en un recipiente no metálico, sin mezclar tipos distintos.',
      'Cubre los terminales con cinta adhesiva para evitar cortocircuitos.',
      'Llévalas a un punto limpio autorizado. Nunca las tires a la basura común.',
    ],
    tip: 'Una sola pila puede contaminar hasta 600 litros de agua. Las pilas contienen metales pesados tóxicos.',
    icon: 'battery',
  },
  {
    id: 'celular',
    name: 'Celular o electrónico',
    category: 'raee',
    keywords: ['celular', 'movil', 'móvil', 'telefono', 'teléfono', 'electrodomestico', 'raee', 'cargador'],
    steps: [
      'Borra todos tus datos personales y restablece el dispositivo a fábrica.',
      'Retira la batería si es extraíble y separa los accesorios (cargadores, cables).',
      'Llévalo a un punto limpio autorizado para RAEE. No lo desarmes en casa.',
    ],
    tip: 'Los RAEE contienen metales valiosos como oro, plata y cobre que pueden recuperarse mediante reciclaje especializado.',
    icon: 'smartphone',
  },
  {
    id: 'organico',
    name: 'Residuo orgánico',
    category: 'organico',
    keywords: ['organico', 'orgánico', 'comida', 'restos de comida', 'cascaras', 'cáscaras', 'compost'],
    steps: [
      'Separa los restos de alimentos (frutas, verduras, café, té) de otros residuos.',
      'Si tienes jardín, inicia un compostero. Si no, busca un punto de compostaje comunitario.',
      'Mezcla con material seco (hojas, papel) para equilibrar el compost.',
    ],
    tip: 'El compostaje doméstico puede reducir hasta un 30% de los residuos que generas en casa.',
    icon: 'leaf',
  },
];

const CATEGORY_SIGNALS: Record<MaterialCategory, string[]> = {
  organico: ['comida', 'fruta', 'frutas', 'verdura', 'verduras', 'cascara', 'cascaras', 'cafe', 'te', 'compost', 'restos de fruta', 'restos de verdura'],
  papel: ['papel', 'carton', 'periodico', 'revista', 'libro', 'sobre', 'tetra pak', 'tetrapak', 'brik'],
  plastico: ['plastico', 'pet', 'polietileno', 'polipropileno', 'yogur', 'detergente'],
  vidrio: ['vidrio', 'frasco de vidrio', 'tarro de vidrio', 'botella de vidrio'],
  metal: ['metal', 'lata', 'latas', 'atun', 'aluminio', 'hojalata', 'cobre'],
  raee: ['celular', 'movil', 'telefono', 'cargador', 'cable usb', 'electronico', 'computador', 'electrodomestico', 'pantalla', 'ampolleta led'],
  pilas: ['pila', 'pilas', 'bateria aa', 'bateria aaa', 'bateria de litio'],
  textil: ['ropa', 'textil', 'tela', 'zapato', 'zapatos', 'zapatilla', 'abrigo'],
  peligroso: ['pintura', 'solvente', 'quimico', 'aceite lubricante', 'aerosol', 'medicamento', 'jeringa'],
};

const AMBIGUOUS_TERMS = new Set(['botella', 'caja', 'envase', 'bolsa', 'vaso', 'bateria', 'bombilla', 'objeto', 'cosa', 'residuo']);

const AMBIGUOUS_ALTERNATIVES: Partial<Record<string, MaterialCategory[]>> = {
  botella: ['plastico', 'vidrio'],
  caja: ['papel', 'plastico'],
  envase: ['plastico', 'vidrio', 'metal'],
  bolsa: ['plastico', 'papel', 'textil'],
  vaso: ['plastico', 'vidrio', 'papel'],
  bateria: ['pilas', 'raee'],
  bombilla: ['plastico', 'raee'],
};

const normalize = (value: string) => value
  .toLocaleLowerCase('es')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const VISUAL_LABEL_TRANSLATIONS: Record<string, string> = {
  'can opener': 'abridor de latas metal',
  'tin opener': 'abridor de latas metal',
  'oil filter': 'filtro de aceite lubricante',
  'plastic bag': 'bolsa de plastico',
  'shopping bag': 'bolsa de plastico',
  carton: 'carton',
  cardboard: 'carton',
  'light bulb': 'ampolleta',
  straw: 'bombilla',
  battery: 'bateria',
  'cell phone': 'celular electronico',
  'mobile phone': 'celular electronico',
  'wine bottle': 'botella de vidrio',
  'beer bottle': 'botella de vidrio',
  'water bottle': 'botella de plastico pet',
  'pop bottle': 'botella de plastico pet',
  'soda bottle': 'botella de plastico pet',
  'pill bottle': 'envase plastico',
  'medicine chest': 'medicamento',
  'paper towel': 'papel',
  envelope: 'papel sobre',
  'notebook computer': 'computador electronico',
  laptop: 'computador electronico',
};

export function translateVisualLabels(labels: string[]): string {
  return labels
    .flatMap((label) => label.split(',').map((part) => part.trim()))
    .map((label) => VISUAL_LABEL_TRANSLATIONS[normalize(label)])
    .filter((label): label is string => Boolean(label))
    .join(' ');
}

export function createCategoryItem(category: MaterialCategory, input = MATERIAL_LABELS[category]): RecyclingItem {
  const guide = MATERIAL_GUIDES.find((entry) => entry.category === category);
  return {
    id: `consulta-${normalize(input).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || category}`,
    name: input.trim() || MATERIAL_LABELS[category],
    category,
    keywords: [],
    steps: guide
      ? [guide.instructions.separation, guide.instructions.limpieza, guide.instructions.compactacion]
      : ['Consulta la normativa local antes de desecharlo.', 'Mantén el residuo separado y manipúlalo con cuidado.', 'Llévalo a un punto autorizado.'],
    tip: guide ? `Antes de reciclarlo, revisa las indicaciones para ${guide.title.toLocaleLowerCase('es')}.` : 'Confirma el material antes de desecharlo.',
    upcycling: category === 'organico'
      ? 'Aprovecha los restos para iniciar una compostera.'
      : category === 'textil'
        ? 'Repara, dona o transforma la tela antes de desecharla.'
        : 'Busca una segunda vida para el objeto antes de enviarlo a reciclar.',
    icon: guide?.icon ?? 'recycle',
  };
}

export function classifyMaterial(input: string): import('@/types').MaterialClassification {
  const normalized = normalize(input);
  if (!normalized) {
    return { status: 'unknown', confidence: 0, item: null, alternatives: [], reason: 'Escribe o dicta un residuo para clasificarlo.' };
  }

  if (AMBIGUOUS_TERMS.has(normalized)) {
    const categories = AMBIGUOUS_ALTERNATIVES[normalized] ?? [];
    return {
      status: 'uncertain',
      confidence: 0.2,
      item: null,
      alternatives: categories.map((category, index) => ({ category, score: categories.length - index, label: MATERIAL_LABELS[category] })),
      reason: `“${input.trim()}” puede referirse a más de un material. Añade el material o selecciona una categoría.`,
    };
  }

  const exactMatches = RECYCLING_ITEMS
    .map((item) => {
      const signals = [item.name, ...item.keywords].map(normalize);
      const exact = signals.some((signal) => signal === normalized);
      const phraseMatches = signals.filter((signal) => signal.length >= 4 && normalized.includes(signal));
      const score = exact ? 10 : phraseMatches.reduce((total, signal) => total + Math.min(4, Math.max(1, signal.split(' ').length)), 0);
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (exactMatches[0]?.score >= 6) {
    return {
      status: 'confident',
      confidence: Math.min(0.98, 0.76 + exactMatches[0].score * 0.02),
      item: exactMatches[0].item,
      alternatives: [{ category: exactMatches[0].item.category, score: exactMatches[0].score, label: MATERIAL_LABELS[exactMatches[0].item.category] }],
    };
  }

  const categoryScores = (Object.keys(CATEGORY_SIGNALS) as MaterialCategory[])
    .map((category) => ({
      category,
      score: CATEGORY_SIGNALS[category].reduce((score, signal) => {
        const normalizedSignal = normalize(signal);
        if (!normalizedSignal) return score;
        if (normalized === normalizedSignal) return score + 4;
        if (normalized.includes(normalizedSignal)) return score + Math.min(3, normalizedSignal.split(' ').length + 1);
        return score;
      }, 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = categoryScores[0];
  const second = categoryScores[1];
  const alternatives = categoryScores.slice(0, 3).map((entry) => ({
    category: entry.category,
    score: entry.score,
    label: MATERIAL_LABELS[entry.category],
  }));

  if (!top) {
    return { status: 'unknown', confidence: 0, item: null, alternatives: [], reason: 'No encontramos señales suficientes para identificar el material.' };
  }

  const containsOnlyAmbiguousSignal = normalized.split(' ').every((token) => AMBIGUOUS_TERMS.has(token)) || AMBIGUOUS_TERMS.has(normalized);
  const tied = Boolean(second && top.score - second.score <= 1);
  if (containsOnlyAmbiguousSignal || tied || top.score < 2) {
    return {
      status: 'uncertain',
      confidence: Math.min(0.59, 0.28 + top.score * 0.08),
      item: null,
      alternatives,
      reason: containsOnlyAmbiguousSignal
        ? 'El nombre es ambiguo. Indica el material, por ejemplo “botella de vidrio” o “botella PET”.'
        : 'Hay más de una categoría posible. Confirma el material antes de continuar.',
    };
  }

  const matchingItem = exactMatches.find((entry) => entry.item.category === top.category && entry.score >= 4)?.item;
  const item = matchingItem ?? createCategoryItem(top.category, input);
  const confidence = Math.min(0.9, 0.5 + top.score * 0.08 - (second ? second.score * 0.025 : 0));
  return {
    status: confidence >= 0.7 ? 'confident' : 'uncertain',
    confidence,
    item: confidence >= 0.6 ? item : null,
    alternatives,
    reason: confidence >= 0.7 ? undefined : 'La clasificación es aproximada; confirma el material.',
  };
}

export const MATERIAL_GUIDES: MaterialGuide[] = [
  {
    category: 'organico',
    title: 'Orgánico',
    icon: 'leaf',
    color: '#8d6e63',
    description: 'Restos de alimentos y materia biodegradable compostable.',
    instructions: {
      separation: 'Separa restos de frutas, verduras, cáscaras, café, té y residuos de jardín. No incluyas carnes, lácteos ni aceites.',
      limpieza: 'No requiere limpieza, pero evita mezclar con materiales no biodegradables.',
      compactacion: 'Pica los residuos en trozos pequeños para acelerar la descomposición en el compostero.',
    },
    examples: ['Cáscaras de fruta', 'Restos de verduras', 'Bolsas de té', 'Filtro de café', 'Hojas secas'],
    notRecyclable: ['Huesos de animales', 'Aceite de cocina', 'Productos lácteos', 'Comida con moho'],
  },
  {
    category: 'papel',
    title: 'Papel y Cartón',
    icon: 'file-text',
    color: '#1976d2',
    description: 'Productos de celulosa como papel, cartón, revistas y cajas.',
    instructions: {
      separation: 'Separa papel y cartón limpio y seco. Retira grapas, clips, cintas adhesivas y espirales metálicas.',
      limpieza: 'El papel debe estar seco y sin restos de grasa, aceite o comida. El papel sucio no se puede reciclar.',
      compactacion: 'Desarma y aplasta las cajas de cartón. Apila el papel y átalo o colócalo en bolsas para transportarlo.',
    },
    examples: ['Cajas de cartón', 'Periódicos', 'Revistas', 'Cuadernos usados', 'Sobres'],
    notRecyclable: ['Papel higiénico usado', 'Servilletas sucias', 'Papel encerado', 'Fotos con químicos'],
  },
  {
    category: 'plastico',
    title: 'Plástico',
    icon: 'recycle',
    color: '#f57c00',
    description: 'Envases y productos de plástico reciclable (PET, HDPE, etc.).',
    instructions: {
      separation: 'Identifica el tipo de plástico por su símbolo de reciclaje (1-7). Separa botellas, envases y bolsas.',
      limpieza: 'Enjuaga los envases con agua para eliminar restos de alimentos o líquidos. No necesitan estar impecables.',
      compactacion: 'Aplasta las botellas y envases para reducir su volumen. Vuelve a colocar la tapa para mantener la forma compacta.',
    },
    examples: ['Botellas PET', 'Envases de yogur', 'Bolsas de plástico limpias', 'Botellas de detergente'],
    notRecyclable: ['Papel film', 'Espuma de embalaje', 'Envases de aceites lubricantes', 'Plásticos sin símbolo'],
  },
  {
    category: 'vidrio',
    title: 'Vidrio',
    icon: 'wine',
    color: '#43a047',
    description: 'Botellas, frascos y envases de vidrio de todo tipo.',
    instructions: {
      separation: 'Separa botellas, frascos y envases de vidrio por color (verde, ámbar, transparente) si el punto lo requiere.',
      limpieza: 'Enjuaga con agua para eliminar restos de alimentos o bebidas. Retira tapas metálicas o de corcho.',
      compactacion: 'No es necesario aplastar el vidrio. Entrégalo intacto para evitar cortes y facilitar la clasificación.',
    },
    examples: ['Botellas de vino', 'Frascos de mermelada', 'Botellas de cerveza', 'Envases de perfumería'],
    notRecyclable: ['Espejos', 'Cristales de ventana', 'Bombillas', 'Cerámica', 'Vidrio templado'],
  },
  {
    category: 'metal',
    title: 'Metales',
    icon: 'disc',
    color: '#757575',
    description: 'Latas de aluminio y hojalata, utensilios y chatarra metálica.',
    instructions: {
      separation: 'Separa latas de bebida (aluminio) de latas de conservas (hojalata). Clasifica otros metales por tipo.',
      limpieza: 'Enjuaga las latas con agua para eliminar restos de comida o bebidas. Evita dejar líquidos en su interior.',
      compactacion: 'Aplasta las latas de aluminio para reducir su volumen. Ten cuidado con los bordes afilados.',
    },
    examples: ['Latas de bebida', 'Latas de atún', 'Papel aluminio limpio', 'Tapas metálicas', 'Tubos de cobre'],
    notRecyclable: ['Latas con pintura química', 'Baterías de coche', 'Metales contaminados con químicos'],
  },
  {
    category: 'raee',
    title: 'RAEE (Electrónicos)',
    icon: 'smartphone',
    color: '#7b1fa2',
    description: 'Residuos de aparatos eléctricos y electrónicos: celulares, electrodomésticos, cables.',
    instructions: {
      separation: 'Separa los aparatos electrónicos de otros residuos. Desconecta y separa baterías, cables y accesorios.',
      limpieza: 'Borra todos tus datos personales y restablece el dispositivo a configuración de fábrica antes de reciclarlo.',
      compactacion: 'No desarmes ni rompas los aparatos. Entrégalos completos en un punto limpio autorizado para RAEE.',
    },
    examples: ['Celulares', 'Cargadores', 'Electrodomésticos pequeños', 'Bombillas LED', 'Cables USB'],
    notRecyclable: ['Bombillas incandescentes rotas', 'Aparatos con asbestos', 'Termómetros de mercurio'],
  },
  {
    category: 'pilas',
    title: 'Pilas y Baterías',
    icon: 'battery',
    color: '#d32f2f',
    description: 'Pilas alcalinas, recargables, de botón y baterías de litio.',
    instructions: {
      separation: 'Separa las pilas por tipo (alcalinas, recargables, litio, botón). No las mezcles con otros residuos.',
      limpieza: 'No intentes limpiar las pilas. Si están corroídas, manéjalas con guantes y colócalas en bolsa sellada.',
      compactacion: 'Cubre los terminales con cinta adhesiva para evitar cortocircuitos. No las perfores ni desarmes.',
    },
    examples: ['Pilas AA', 'Pilas AAA', 'Pilas de botón', 'Baterías de litio', 'Baterías de celular'],
    notRecyclable: ['Pilas dañadas con fugas (manejo especial)', 'Baterías industriales de plomo-ácido'],
  },
  {
    category: 'textil',
    title: 'Textiles',
    icon: 'package',
    color: '#8e24aa',
    description: 'Ropa, calzado y telas que pueden reutilizarse o recuperarse.',
    instructions: {
      separation: 'Separa ropa, calzado y telas de otros residuos. Prioriza donar o reparar las prendas en buen estado.',
      limpieza: 'Lava y seca las prendas antes de entregarlas. Ata los pares de zapatos para que no se separen.',
      compactacion: 'Guarda los textiles secos en una bolsa cerrada y no los mezcles con residuos húmedos.',
    },
    examples: ['Ropa', 'Zapatos', 'Toallas', 'Sábanas', 'Retazos de tela'],
    notRecyclable: ['Textiles mojados', 'Prendas con sustancias químicas', 'Telas con moho'],
  },
  {
    category: 'peligroso',
    title: 'Residuos Peligrosos',
    icon: 'shield',
    color: '#b71c1c',
    description: 'Materiales que requieren manejo especializado para proteger a las personas y al ambiente.',
    instructions: {
      separation: 'Mantén pinturas, solventes, aerosoles, medicamentos y químicos separados de la basura común.',
      limpieza: 'No mezcles, diluyas ni intentes limpiar estos productos. Conserva sus envases originales cerrados.',
      compactacion: 'No aplastes ni perfores los envases. Entrégalos en un punto autorizado y sigue sus instrucciones.',
    },
    examples: ['Pinturas', 'Solventes', 'Aerosoles', 'Medicamentos vencidos', 'Aceites lubricantes'],
    notRecyclable: ['Químicos vertidos al desagüe', 'Envases abiertos', 'Materiales mezclados'],
  },
];
