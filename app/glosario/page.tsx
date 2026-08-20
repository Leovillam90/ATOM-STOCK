'use client';

import React, { useState } from 'react';

export default function GlosarioPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>('conceptos-basicos');

  // CONTENIDO DEL MANUAL Y GLOSARIO (100% Actualizado a las últimas funciones)
  const manualSections = [
    {
      id: 'conceptos-basicos',
      title: 'Glosario: Conceptos Básicos',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      content: (
        <div className="space-y-4 text-sm text-gray-600 font-satoshi-regular leading-relaxed">
          <p><strong className="text-gray-900 font-satoshi-black">SKU (Código de Producto):</strong> Es la clave única e irrepetible que identifica a cada artículo en tu inventario. Funciona como la cédula del producto.</p>
          <p><strong className="text-gray-900 font-satoshi-black">TRM (Tasa Representativa del Mercado):</strong> Es la tasa de cambio de Pesos Colombianos (COP) a Dólares (USD). Se utiliza al exportar archivos tipo *Packing List* para convertir automáticamente tus costos y precios de venta.</p>
          <p><strong className="text-gray-900 font-satoshi-black">Bodega Droko:</strong> Es un centro de acopio o almacén en el sistema creado exclusivamente para aislar y controlar el inventario destinado a canales de e-commerce y dropshipping.</p>
          <p><strong className="text-gray-900 font-satoshi-black">Base Gravable:</strong> Es el valor neto de un producto antes de sumar los impuestos (IVA). Si marcas que el precio ya incluye IVA, LOBO STOCK discrimina y separa la base de forma automática.</p>
          <p><strong className="text-gray-900 font-satoshi-black">Consumidor Final (CF):</strong> Cliente genérico que se utiliza en la caja (POS) cuando realizas una venta rápida y el comprador no solicita factura a su nombre.</p>
        </div>
      )
    },
    {
      id: 'configuracion-inicial',
      title: '1. Configuración Inicial (Sedes y Bodega Droko)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      content: (
        <div className="space-y-4 text-sm text-gray-600 font-satoshi-regular leading-relaxed">
          <p>Para administrar tu inventario debes registrar tus ubicaciones físicas en <em>Sucursales / Sedes</em>:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Crear Sedes Estándar:</strong> Registra Puntos de Venta (POS) o Bodegas Logísticas generales.</li>
            <li><strong>Crear Bodega DROKO:</strong> Junto al botón de nueva sede dispones del botón amarillo <em>"Crear Bodega DROKO"</em>. Si ya cuentas con una bodega creada, tomará sus datos de ubicación automáticamente para habilitar esta bodega especial.</li>
            <li><strong>Protección de Nombre:</strong> El nombre de la *Bodega DROKO* queda protegido por el sistema para garantizar la integración en exportaciones y reportes. Una vez creada, la opción desaparece del menú superior para evitar duplicados.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'productos-inventario',
      title: '2. Catálogo y Estructura de Precios (Nivel Droko)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      content: (
        <div className="space-y-4 text-sm text-gray-600 font-satoshi-regular leading-relaxed">
          <p>En el <em>Consolidado de Productos</em> administras tus tarifas y stock distribuido:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-gray-900 font-satoshi-black">Precios Diferenciados:</strong> Puedes definir hasta 4 precios finales: *Por Mayor*, *Tienda POS*, *E-Commerce* y *Droko*.</li>
            <li><strong className="text-gray-900 font-satoshi-black">Campo Especial Droko ($):</strong> El campo de precio Droko se habilita en el formulario cuando tienes creada la Bodega Droko en tu cuenta. Se utiliza para asignar la tarifa de venta exclusiva para esta plataforma.</li>
            <li><strong className="text-gray-900 font-satoshi-black">Aislamiento de Inventario:</strong> El stock que asignes a la Bodega Droko se mantendrá independiente del inventario de tus tiendas físicas.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'exportacion-droko',
      title: '3. Exportación de Inventarios (General y Droko USD)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      content: (
        <div className="space-y-4 text-sm text-gray-600 font-satoshi-regular leading-relaxed">
          <p>En el botón superior <em>Exportar (CSV)</em> del catálogo, el usuario Administrador cuenta con dos opciones especializadas:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-gray-900 font-satoshi-black">Exportar General (Todo):</strong> Descarga el consolidado completo de la empresa con todos los productos, costos, tarifas e inventario acumulado.</li>
            <li><strong className="text-gray-900 font-satoshi-black">Exportar Droko (Packing List):</strong> Genera un archivo CSV filtrado de forma inteligente:
              <ol className="list-decimal pl-5 mt-1 space-y-1">
                <li>Exporta <strong>únicamente</strong> los productos que tienen stock asignado a la Bodega Droko.</li>
                <li>Pide la **TRM** al momento de descargar para convertir automáticamente los costos y el *Precio Droko* de Pesos Colombianos (COP) a Dólares (USD).</li>
              </ol>
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'traslados',
      title: '4. Traslados de Mercancía',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      content: (
        <div className="space-y-4 text-sm text-gray-600 font-satoshi-regular leading-relaxed">
          <p>Permite mover mercancía de tus bodegas principales a tus tiendas POS o a la Bodega Droko:</p>
          <ol className="list-decimal pl-5 space-y-2">
            <li><strong className="text-gray-900 font-satoshi-black">Paso 1 (Envío):</strong> Indicas el Origen, Destino, Transportadora y Guía. El stock se descuenta del Origen y el estado pasa a <em>"EN TRÁNSITO"</em>.</li>
            <li><strong className="text-gray-900 font-satoshi-black">Paso 2 (Recepción):</strong> Cuando la mercancía llega físicamente, se hace clic en <em>"Marcar como Recibido"</em> para sumar las unidades al Destino.</li>
          </ol>
        </div>
      )
    },
    {
      id: 'ventas-pos-facturacion',
      title: '5. Registro de Ventas (Caja POS) y Control Contable',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 00-4zm-8 2a2 2 0 100 4 2 2 0 00-4z" />
        </svg>
      ),
      content: (
        <div className="space-y-4 text-sm text-gray-600 font-satoshi-regular leading-relaxed">
          <p>Operación diaria de ventas presenciales e historial consolidado:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-gray-900 font-satoshi-black">Caja POS:</strong> Cobra a clientes presenciales, aplica descuentos auditables con justificación obligatoria e imprime recibos o envíalos por WhatsApp.</li>
            <li><strong className="text-gray-900 font-satoshi-black">Pre-Facturación:</strong> Consulta el historial inalterable de todas las ventas de la empresa y descarga el reporte consolidado listo para enviar al contador y cumplir con los requerimientos de la DIAN.</li>
          </ul>
        </div>
      )
    }
  ];

  // FILTRADO DEL GLOSARIO
  const sectionsFiltradas = manualSections.filter(sec => 
    sec.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    sec.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-gray-800 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD800] border border-gray-800 animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-gray-900 uppercase tracking-wider font-bold">
              Centro de Aprendizaje
            </span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight font-satoshi-black">
            MANUAL DE USUARIO Y GLOSARIO
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-satoshi-regular max-w-xl">
            Aprende a usar la plataforma, entiende los conceptos básicos y sácale el máximo provecho a tu sistema.
          </p>
        </div>
      </div>

      {/* BUSCADOR */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-8 shadow-sm max-w-2xl">
        <div className="relative w-full">
          <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl pl-10 pr-4 py-3 text-xs text-gray-900 placeholder-gray-400 focus:outline-none transition-all font-satoshi-regular"
            placeholder="Escribe un tema o concepto que desees buscar (ej: Droko, TRM, IVA, Traslados)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ACORDEÓN DE CONTENIDOS */}
      <div className="max-w-4xl space-y-4">
        {sectionsFiltradas.map((section) => (
          <div 
            key={section.id} 
            className={`bg-white border transition-all duration-300 rounded-2xl overflow-hidden shadow-sm ${
              activeSection === section.id ? 'border-[#FFD800]' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <button
              onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
              className="w-full flex items-center justify-between p-5 text-left focus:outline-none"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  activeSection === section.id ? 'bg-[#222222] text-[#FFD800]' : 'bg-gray-100 text-gray-500'
                }`}>
                  {section.icon}
                </div>
                <h2 className="font-satoshi-black text-sm md:text-base text-gray-900 font-bold">
                  {section.title}
                </h2>
              </div>
              
              <svg 
                className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${activeSection === section.id ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* CONTENIDO DESPLEGABLE */}
            <div 
              className={`transition-all duration-500 ease-in-out px-5 overflow-hidden ${
                activeSection === section.id ? 'max-h-[1000px] opacity-100 pb-5' : 'max-h-0 opacity-0 pb-0'
              }`}
            >
              <div className="pt-2 border-t border-gray-100 mt-2">
                {section.content}
              </div>
            </div>
          </div>
        ))}

        {sectionsFiltradas.length === 0 && (
          <div className="text-center py-12 bg-white rounded-2xl border border-gray-200 text-gray-500 text-xs font-satoshi-regular">
            No se encontraron temas relacionados con la búsqueda.
          </div>
        )}
      </div>

    </div>
  );
}
