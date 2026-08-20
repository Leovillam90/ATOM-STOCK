export interface MonedaConfig {
  codigo: string;
  nombre: string;
  simbolo: string;
  locale: string;
}

export interface TarifaImpuesto {
  valor: number;
  label: string;
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

export const IMPUESTOS_POR_MONEDA: { [codigoMoneda: string]: TarifaImpuesto[] } = {
  COP: [
    { valor: 19, label: '19% - IVA Tarifa General' },
    { valor: 5, label: '5% - IVA Tarifa Reducida' },
    { valor: 8, label: '8% - Impuesto Consumo (INC)' },
    { valor: 0, label: '0% - Exento / Excluido' }
  ],
  MXN: [
    { valor: 16, label: '16% - IVA Tarifa General' },
    { valor: 8, label: '8% - Tasa Estímulo Fronterizo' },
    { valor: 0, label: '0% - Exento / Tasa 0%' }
  ],
  CLP: [
    { valor: 19, label: '19% - IVA Tarifa General Única' },
    { valor: 0, label: '0% - Exento' }
  ],
  PEN: [
    { valor: 18, label: '18% - IGV + IPM (General)' },
    { valor: 10, label: '10% - Tasa Especial MYPEs' },
    { valor: 0, label: '0% - Exento' }
  ],
  GTQ: [
    { valor: 12, label: '12% - IVA Régimen General' },
    { valor: 5, label: '5% - Pequeño Contribuyente' },
    { valor: 0, label: '0% - Exento' }
  ],
  BRL: [
    { valor: 18, label: '18% - ICMS Estándar (SP)' },
    { valor: 20, label: '20% - ICMS Estatal Máximo' },
    { valor: 9.25, label: '9.25% - PIS + COFINS' },
    { valor: 26.5, label: '26.5% - IVA Unificado (Reforma)' },
    { valor: 0, label: '0% - Exento' }
  ],
  VES: [
    { valor: 16, label: '16% - IVA Tarifa General' },
    { valor: 8, label: '8% - IVA Tarifa Reducida' },
    { valor: 3, label: '3% - IGTF Adicional Divisas' },
    { valor: 0, label: '0% - Exento' }
  ],
  EUR: [
    { valor: 21, label: '21% - IVA Tarifa General' },
    { valor: 10, label: '10% - IVA Tarifa Reducida' },
    { valor: 4, label: '4% - IVA Superreducido' },
    { valor: 0, label: '0% - Exento' }
  ],
  USD: [
    { valor: 15, label: '15% - Ecuador (IVA General)' },
    { valor: 13, label: '13% - Ecuador (Construcción)' },
    { valor: 8, label: '8% - Ecuador (Turismo)' },
    { valor: 15, label: '15% - Panamá (Tabaco)' },
    { valor: 10, label: '10% - Panamá (Hoteles/Alcohol) / Paraguay' },
    { valor: 7, label: '7% - Panamá ITBMS General' },
    { valor: 5, label: '5% - Paraguay IVA Reducido' },
    { valor: 21, label: '21% - Argentina (General)' },
    { valor: 10.5, label: '10.5% - Argentina (Reducida)' },
    { valor: 27, label: '27% - Argentina (Servicios)' },
    { valor: 0, label: '0% - Exento / Sin Impuesto' }
  ]
};

export const obtenerMonedaPorIndicativo = (indicativo: string): string => {
  return MAPA_INDICATIVO_MONEDA[indicativo] || 'COP';
};

export const obtenerTarifasImpuesto = (codigoMoneda: string = 'COP'): TarifaImpuesto[] => {
  return IMPUESTOS_POR_MONEDA[codigoMoneda] || IMPUESTOS_POR_MONEDA['COP'];
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
