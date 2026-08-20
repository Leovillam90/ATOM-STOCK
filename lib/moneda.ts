export interface MonedaConfig {
  codigo: string;
  nombre: string;
  simbolo: string;
  locale: string;
}

export const MONEDAS: MonedaConfig[] = [
  { codigo: 'COP', nombre: 'Colombia (COP)', simbolo: '$', locale: 'es-CO' },
  { codigo: 'USD', nombre: 'Estados Unidos (USD)', simbolo: '$', locale: 'en-US' },
  { codigo: 'MXN', nombre: 'México (MXN)', simbolo: '$', locale: 'es-MX' },
  { codigo: 'GTQ', nombre: 'Guatemala (GTQ)', simbolo: 'Q', locale: 'es-GT' },
  { codigo: 'PEN', nombre: 'Perú (PEN)', simbolo: 'S/', locale: 'es-PE' },
  { codigo: 'CLP', nombre: 'Chile (CLP)', simbolo: '$', locale: 'es-CL' },
  { codigo: 'BRL', nombre: 'Brasil (BRL)', simbolo: 'R$', locale: 'pt-BR' },
  { codigo: 'EUR', nombre: 'Europa (EUR)', simbolo: '€', locale: 'es-ES' },
  { codigo: 'VES', nombre: 'Venezuela (VES)', simbolo: 'Bs', locale: 'es-VE' }
];

export const MAPA_INDICATIVO_MONEDA: { [key: string]: string } = {
  '+57': 'COP',
  '+593': 'USD',
  '+52': 'MXN',
  '+595': 'USD',
  '+51': 'PEN',
  '+56': 'CLP',
  '+507': 'USD',
  '+502': 'GTQ',
  '+55': 'BRL',
  '+54': 'USD',
  '+58': 'VES',
};

export const obtenerMonedaPorIndicativo = (indicativo: string): string => {
  return MAPA_INDICATIVO_MONEDA[indicativo] || 'COP';
};

export const formatearMonedaGlobal = (monto: number, codigoMoneda: string = 'COP'): string => {
  const config = MONEDAS.find(m => m.codigo === codigoMoneda) || MONEDAS[0];
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.codigo,
    minimumFractionDigits: config.codigo === 'CLP' || config.codigo === 'COP' ? 0 : 2,
    maximumFractionDigits: config.codigo === 'CLP' || config.codigo === 'COP' ? 0 : 2
  }).format(monto || 0);
};
