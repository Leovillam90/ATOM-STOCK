'use client';

import React, { useState } from 'react';

export default function GlosarioPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>('conceptos-basicos');

  // CONTENIDO DEL MANUAL Y GLOSARIO (Actualizado, claro y sin términos técnicos complejos)
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
          <p><strong className="text-gray-900 font-satoshi-black">SKU (Código de Producto):</strong> Es el código único que identifica a cada artículo en tu inventario. Piensa en él como la "cédula" del producto. No pueden existir dos productos con el mismo SKU.</p>
          <p><strong className="text-gray-900 font-satoshi-black">Base Gravable:</strong> Es el valor real de un producto antes de sumarle los impuestos (como el IVA). Si ingresas un precio con el IVA ya incluido, el sistema hace la matemática por ti y separa la base gravable automáticamente.</p>
          <p><strong className="text-gray-900 font-satoshi-black">Consumidor Final (CF):</strong> Es un cliente "genérico". Se utiliza cuando haces una venta rápida en el mostrador y el comprador no desea dar su nombre, cédula o correo.</p>
          <p><strong className="text-gray-900 font-satoshi-black">Documento de Venta:</strong> Es el recibo o comprobante que se le entrega al cliente tras una compra. Contiene el detalle de lo que pagó y los impuestos aplicados.</p>
        </div>
      )
    },
    {
      id: 'configuracion-inicial',
      title: '1. Configuración Inicial (Sedes y Equipo)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      content: (
        <div className="space-y-4 text-sm text-gray-600 font-satoshi-regular leading-relaxed">
          <p>Para que LOBO STOCK funcione correctamente, necesita saber dónde están tus productos y quién los vende:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Paso 1 - Crear Sedes:</strong> Ve al menú <em>Sucursales / Sedes</em>. Aquí debes registrar tus tiendas físicas o bodegas. El inventario siempre pertenece a una sede específica.</li>
            <li><strong>Paso 2 - Registrar Equipo:</strong> Ve a <em>Equipo / Vendedores</em>. Aquí le creas un usuario y contraseña a tus empleados para que puedan entrar al sistema. A cada uno le puedes asignar un rol (ej. Vendedor) y decirle en qué sede va a trabajar.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'productos-inventario',
      title: '2. Catálogo e Inventario',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      content: (
        <div className="space-y-4 text-sm text-gray-600 font-satoshi-regular leading-relaxed">
          <p>En la sección de <em>Catálogo de Productos</em> es donde le das vida a tu inventario. Al crear un producto nuevo, puedes ponerle distintos precios dependiendo de dónde lo vendas (al detal, al por mayor o en internet).</p>
          <p><strong className="text-gray-900 font-satoshi-black">Inventario Separado:</strong> LOBO STOCK es muy organizado. Si tienes 10 camisetas en la Tienda A y 5 en la Tienda B, el sistema nunca las mezclará. Si un vendedor hace una factura en la Tienda A, solo se descontará de la Tienda A.</p>
        </div>
      )
    },
    {
      id: 'traslados',
      title: '3. Traslados de Mercancía',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
      content: (
        <div className="space-y-4 text-sm text-gray-600 font-satoshi-regular leading-relaxed">
          <p>¿Necesitas mover productos de una bodega a una tienda? Hazlo desde <em>Traslados de Stock</em>. El sistema lo hace en dos pasos muy seguros:</p>
          <ol className="list-decimal pl-5 space-y-2">
            <li><strong className="text-gray-900 font-satoshi-black">Paso 1 (El Envío):</strong> Dices qué productos vas a mandar, con qué transportadora y el número de guía. En ese momento, el sistema le <strong>resta</strong> los productos a la bodega que los envía. El estado quedará <em>"EN TRÁNSITO"</em>.</li>
            <li><strong className="text-gray-900 font-satoshi-black">Paso 2 (La Recepción):</strong> Cuando la caja física llega a la otra tienda, el vendedor encargado hace clic en <em>"Marcar como Recibido"</em>. Solo hasta ese momento, los productos se <strong>suman</strong> al inventario de la tienda destino.</li>
          </ol>
          <p className="mt-2 text-xs bg-gray-100 p-3 border border-gray-200 rounded-xl text-gray-600">
            <strong className="text-gray-900">Nota:</strong> Si alguien se equivoca, únicamente el Administrador tiene permiso para "Anular" un traslado. Al hacerlo, el inventario regresa mágicamente a la bodega original, pero el sistema exigirá escribir un porqué para dejar constancia.
          </p>
        </div>
      )
    },
    {
      id: 'ventas-pos',
      title: '4. Registro de Ventas (Caja)',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 00-4zm-8 2a2 2 0 100 4 2 2 0 00-4z" />
        </svg>
      ),
      content: (
        <div className="space-y-4 text-sm text-gray-600 font-satoshi-regular leading-relaxed">
          <p>Esta es tu caja registradora virtual. Aquí es donde atiendes a los clientes que te compran en el mostrador o por chat.</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Stock Inteligente:</strong> Si intentas vender algo que ya no te queda en la tienda, el sistema te bloqueará para evitar que vendas "aire".</li>
            <li><strong>Descuentos Controlados:</strong> Si le quieres dar un descuento a un cliente, el sistema te obligará a escribir el motivo (ej: "Descuento por cliente frecuente"). Así el dueño siempre sabrá por qué se cobró menos.</li>
            <li><strong>Entrega de Recibo:</strong> Al terminar de cobrar, puedes imprimir el Documento de Venta en una impresora térmica, o mejor aún, enviárselo directamente al WhatsApp del cliente con un solo clic.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'facturacion-exportacion',
      title: '5. Facturación y Exportación Contable',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 01-2-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      content: (
        <div className="space-y-4 text-sm text-gray-600 font-satoshi-regular leading-relaxed">
          <p>En el módulo de <em>Facturación</em> encontrarás un historial organizado, seguro e inalterable de todas las ventas que se han realizado en tu negocio, ya sea en las tiendas o desde las bodegas principales.</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong className="text-gray-900 font-satoshi-black">Monitoreo:</strong> Puedes revisar fácilmente qué se vendió, a quién se le vendió, qué día y si el documento fue <em>Emitido</em> o <em>Anulado</em>.</li>
            <li><strong className="text-gray-900 font-satoshi-black">Reimpresión:</strong> ¿Un cliente perdió su recibo? Aquí puedes buscar la factura por nombre o cédula y volver a visualizarla o imprimirla.</li>
            <li><strong className="text-gray-900 font-satoshi-black">Reporte para la DIAN:</strong> A fin de mes, ya no tienes que hacer cuentas a mano. Simplemente filtra el mes que deseas y dale clic al botón amarillo <em>Exportar Consolidado Contable</em>. El sistema descargará un archivo de Excel (CSV) perfecto, con los impuestos discriminados y los datos de los clientes listos para entregárselos a tu contador.</li>
          </ul>
        </div>
      )
    }
  ];

  // FILTRADO DEL GLOSARIO
  const sectionsFiltradas = manualSections.filter(sec => 
    sec.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    sec.content.props.children.toString().toLowerCase().includes(searchQuery.toLowerCase()) ||
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
            placeholder="Escribe un tema o concepto que desees buscar (ej: IVA, Traslados, POS)..."
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