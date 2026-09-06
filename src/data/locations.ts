import type { Achievement } from '@/types';

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-recycle',
    title: 'Primer Paso',
    description: 'Recicla por primera vez',
    icon: 'sprout',
    points: 10,
    threshold: 1,
  },
  {
    id: 'eco-warrior',
    title: 'Guerrero Eco',
    description: 'Recicla 10 residuos',
    icon: 'shield',
    points: 50,
    threshold: 10,
  },
  {
    id: 'recycling-master',
    title: 'Maestro del Reciclaje',
    description: 'Recicla 50 residuos',
    icon: 'crown',
    points: 200,
    threshold: 50,
  },
  {
    id: 'variety-collector',
    title: 'Coleccionista',
    description: 'Recicla 5 tipos de materiales distintos',
    icon: 'palette',
    points: 100,
    threshold: 5,
  },
  {
    id: 'glass-hero',
    title: 'Héroe del Vidrio',
    description: 'Recicla 10 botellas de vidrio',
    icon: 'wine',
    points: 80,
    threshold: 10,
  },
  {
    id: 'plastic-saver',
    title: 'Salvador de Océanos',
    description: 'Recicla 20 plásticos',
    icon: 'waves',
    points: 120,
    threshold: 20,
  },
  {
    id: 'planet-guardian',
    title: 'Guardián del Planeta',
    description: 'Acumula 500 puntos',
    icon: 'globe',
    points: 0,
    threshold: 500,
  },
];

export const IMPACT_STATS = {
  current: {
    title: 'Situación Actual',
    problems: [
      { icon: 'help-circle', text: 'Dudas frecuentes en la separación de residuos' },
      { icon: 'accessibility', text: 'Baja accesibilidad para personas mayores o con discapacidad' },
      { icon: 'meh', text: 'Falta de incentivos para mantener el hábito de reciclar' },
      { icon: 'map-off', text: 'Desconocimiento de los puntos limpios cercanos' },
    ],
  },
  projected: {
    title: 'Escenario con EcoLingo',
    benefits: [
      { icon: 'check-circle', text: 'Autonomía total: cada usuario sabe qué y cómo reciclar' },
      { icon: 'mic', text: 'Guía práctica con dictado por voz para todas las edades' },
      { icon: 'trophy', text: 'Hábitos sostenibles reforzados con gamificación' },
      { icon: 'map', text: 'Geolocalización de puntos limpios en tiempo real' },
    ],
  },
};

export const COMPLEMENTARY_TECH = [
  {
    title: 'Red de Promotores Ambientales',
    description: 'Estudiantes y docentes capacitados que replican conocimientos de reciclaje en sus comunidades y barrios.',
    icon: 'users',
  },
  {
    title: 'Talleres Comunitarios',
    description: 'Sesiones educativas en colegios, bibliotecas y centros comunitarios para enseñar reciclaje de forma práctica.',
    icon: 'presentation',
  },
  {
    title: 'Alianzas con Municipios',
    description: 'Convenios con gobiernos locales para mantener datos actualizados de puntos limpios y rutas de recolección.',
    icon: 'building-2',
  },
];
