'use client';

import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ProductosPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [productos, setProductos] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [ventas, setVentas] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Control de Vista: Tabla de Datos vs Tarjetas
  const [viewMode, setViewMode] = useState<'TABLA' | 'TARJETAS'>('TABLA');

  // Filtros de Rotación e Inventario
  const [filtroStockRotacion, setFiltroStockRotacion] = useState<'TODOS' | 'BAJO_STOCK' | 'INTERMEDIO' | 'INACTIVO_60' | 'INACTIVO_90' | 'INACTIVO_120'>('TODOS');
  const [bodegaFiltro, setBodegaFiltro] = useState<string>('TODAS');

  // Modal Crear / Editar Producto Manual
  const [showModal, setShowModal] = useState(false);
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [skuInput, setSkuInput] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  
  // TRES NIVELES DE PRECIOS
  const [pmayor, setPmayor] = useState<number | ''>('');
  const [plocal, setPlocal] = useState<number | ''>('');
  const [pecom, setPecom] = useState<number | ''>('');

  // CONFIGURACIÓN DE IVA EN EL PRODUCTO (PRECIO FINAL FIJO)
  const [aplicaIva, setAplicaIva] = useState<boolean>(true);
  const [tarifaIva, setTarifaIva] = useState<number>(19);

  // COSTOS UNITARIOS (UNIT ECONOMICS)
  const [costoImportacion, setCostoImportacion] = useState<number | ''>('');
  const [costoFulfilment, setCostoFulfilment] = useState<number | ''>('');
  const [imagenUrl, setImagenUrl] = useState('');
  const [stockMap, setStockMap] = useState<{ [key: string]: number }>({});
  
  // AUDITORÍA Y JUSTIFICACIÓN DE CAMBIOS
  const [motivoEdicion, setMotivoEdicion] = useState('');
  const [historialCambios, setHistorialCambios] = useState<any[]>([]);
  const [activeModalTab, setActiveModalTab] = useState<'DATOS' | 'HISTORIAL'>('DATOS');

  const [loading, setLoading] = useState(false);

  // Modal Carga Masiva
  const [showModalMasivo, setShowModalMasivo] = useState(false);
  const [fileMasivo, setFileMasivo] = useState<File | null>(null);
  const [loadingMasivo, setLoadingMasivo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileImageRef = useRef<HTMLInputElement>(null);

  const formatoCOP = (v: number) => 
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      setUserAuth(JSON.parse(savedUser));
    }
  }, []);

  // Escuchar Firestore
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const qProd = query(collection(db, 'productos'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubProd = onSnapshot(qProd, (snap) => {
      setProductos(snap.docs.map(d => ({ ...d.data(), sku: d.id })));
    });

    const qSuc = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubSuc = onSnapshot(qSuc, (snap) => {
      setSucursales(snap.docs.map(d => ({ ...d.data(), id_doc: d.id })));
    });

    const qVent = query(collection(db, 'ventas'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubVent = onSnapshot(qVent, (snap) => {
      setVentas(snap.docs.map(d => d.data()));
    });

    return () => {
      unsubProd();
      unsubSuc();
      unsubVent();
    };
  }, [userAuth]);

  // Rotación (Días sin venta)
  const obtenerDiasSinMovimiento = (sku: string) => {
    const ventasSku = ventas.filter(v => {
      if (Array.isArray(v.items)) {
        return v.items.some((it: any) => it.sku === sku);
      }
      return v.sku === sku;
    });

    if (ventasSku.length === 0) return 999;

    let maxFechaMs = 0;
    ventasSku.forEach(v => {
      const fStr = v.fecha_cobro || v.fecha;
      if (fStr) {
        const ms = new Date(fStr).getTime();
        if (ms > maxFechaMs) maxFechaMs = ms;
      }
    });

    if (maxFechaMs === 0) return 999;

    const hoyMs = new Date().getTime();
    const difDias = Math.floor((hoyMs - maxFechaMs) / (1000 * 60 * 60 * 24));
    return Math.max(0, difDias);
  };

  const obtenerStockTotalProducto = (p: any, idBod?: string) => {
    const stMap = p.stock || {};
    if (idBod && idBod !== 'TODAS') {
      return Number(stMap[idBod] || 0);
    }
    return Object.values(stMap).reduce((acc: number, val: any) => acc + (Number(val) || 0), 0);
  };

  // Convertir archivo local de imagen a Base64
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen no debe superar los 2MB de tamaño.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagenUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // DETERMINAR SEDES AUTORIZADAS QUE PUEDE EDITAR EL USUARIO ACTUAL
  const obtenerSedesAutorizadasUsuario = () => {
    if (!userAuth) return [];

    if (userAuth.rol === 'ADMIN') {
      return sucursales.filter(s => s.estado !== 'INACTIVA');
    }

    let sedesUserIds: string[] = [];
    if (Array.isArray(userAuth.sedes_asignadas) && userAuth.sedes_asignadas.length > 0) {
      sedesUserIds = userAuth.sedes_asignadas;
    } else if (userAuth.id_sucursal) {
      sedesUserIds = [userAuth.id_sucursal];
    }

    return sucursales.filter(s => s.estado !== 'INACTIVA' && sedesUserIds.includes(s.id_sucursal));
  };

  const handleOpenCreate = () => {
    setEditingSku(null);
    setSkuInput('');
    setNombre('');
    setCategoria('GENERAL');
    setPmayor('');
    setPlocal('');
    setPecom('');
    setAplicaIva(true);
    setTarifaIva(19);
    setCostoImportacion('');
    setCostoFulfilment('');
    setImagenUrl('');

    const sedesPermitidas = obtenerSedesAutorizadasUsuario();
    const initialStockMap: { [key: string]: number } = {};
    sedesPermitidas.forEach(s => {
      if (s.id_sucursal) initialStockMap[s.id_sucursal] = 0;
    });

    setStockMap(initialStockMap);
    setMotivoEdicion('');
    setHistorialCambios([]);
    setActiveModalTab('DATOS');
    setShowModal(true);
  };

  const handleOpenEdit = (p: any) => {
    setEditingSku(p.sku);
    setSkuInput(p.sku);
    setNombre(p.nombre || '');
    setCategoria(p.categoria || 'GENERAL');
    
    setPmayor(p.pmayor !== undefined ? p.pmayor : '');
    setPlocal(p.plocal !== undefined ? p.plocal : (p.precio !== undefined ? p.precio : ''));
    setPecom(p.pecom !== undefined ? p.pecom : '');

    setAplicaIva(p.aplica_iva !== undefined ? p.aplica_iva : true);
    setTarifaIva(p.iva !== undefined ? Number(p.iva) : 19);
    
    setCostoImportacion(p.costo_importacion !== undefined ? p.costo_importacion : '');
    setCostoFulfilment(p.costo_fulfilment !== undefined ? p.costo_fulfilment : '');
    setImagenUrl(p.imagen_url || '');
    
    const currentStockMap = p.stock || {};
    setStockMap(currentStockMap);
    setMotivoEdicion('');
    setHistorialCambios(Array.isArray(p.historial_cambios) ? p.historial_cambios : []);
    setActiveModalTab('DATOS');
    setShowModal(true);
  };

  const handleStockSedeChange = (idSucursal: string, cant: number) => {
    setStockMap(prev => ({
      ...prev,
      [idSucursal]: Math.max(0, cant)
    }));
  };

  // CÁLCULO DE DESGLOSE DE IVA
  const calcularBaseEIVA = (precioFinal: number, tarifa: number, incluye: boolean) => {
    if (!incluye || tarifa <= 0) {
      return { base: precioFinal, iva: 0 };
    }
    const base = precioFinal / (1 + (tarifa / 100));
    const iva = precioFinal - base;
    return { base, iva };
  };

  // AUXILIAR DE LIMPIEZA DE FORMATEOS FINANCIEROS (Ej: "$ 120,00" -> 120)
  const parseMontoPuro = (val: any) => {
    if (val === undefined || val === null) return 0;
    let numStr = String(val).replace(/[\$\s"]/g, '').trim();
    if (!numStr) return 0;
    if (numStr.includes(',')) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    }
    const parsed = Number(numStr);
    return isNaN(parsed) ? 0 : parsed;
  };

  // GUARDAR O ACTUALIZAR PRODUCTO (CON VALIDACIÓN DE SKU DUPLICADO)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuInput.trim() || !nombre.trim()) {
      return alert('Ingresa el SKU y el Nombre del producto.');
    }

    const skuClean = skuInput.trim().toUpperCase();

    // VALIDACIÓN: NO PERMITIR SKU REPETIDOS EN CREACIÓN
    if (!editingSku) {
      const existeProd = productos.some(p => String(p.sku || '').toUpperCase() === skuClean);
      if (existeProd) {
        return alert(`El SKU "${skuClean}" ya existe en el sistema. Utiliza un SKU único o edita el producto existente.`);
      }
    }

    if (editingSku && !motivoEdicion.trim()) {
      return alert('Por favor ingresa la justificación o motivo del cambio.');
    }

    setLoading(true);
    try {
      const fechaActualISO = new Date().toISOString();

      const precioDefinido = Number(plocal) || Number(pecom) || Number(pmayor) || 0;
      const tarifaAplicada = aplicaIva ? Number(tarifaIva) : 0;
      const { base, iva } = calcularBaseEIVA(precioDefinido, tarifaAplicada, aplicaIva);

      const nuevoCambioAuditoria = editingSku ? {
        fecha: fechaActualISO,
        usuario_nombre: userAuth?.nombre || 'Usuario ATOM',
        usuario_id: userAuth?.id_usuario || '',
        usuario_rol: userAuth?.rol || 'ADMIN',
        motivo: motivoEdicion.trim(),
        nombre_producto: nombre.trim(),
        precio_mayor: Number(pmayor) || 0,
        precio_pos: Number(plocal) || 0,
        precio_ecom: Number(pecom) || 0,
        costo_importacion: Number(costoImportacion) || 0,
        costo_fulfilment: Number(costoFulfilment) || 0,
        iva_porcentaje: tarifaAplicada
      } : null;

      const historialActualizado = editingSku 
        ? [nuevoCambioAuditoria, ...historialCambios]
        : [{
            fecha: fechaActualISO,
            usuario_nombre: userAuth?.nombre || 'Usuario ATOM',
            usuario_id: userAuth?.id_usuario || '',
            usuario_rol: userAuth?.rol || 'ADMIN',
            motivo: 'Creación Inicial de Producto',
            nombre_producto: nombre.trim()
          }];

      const prodObj = {
        id_cuenta: userAuth.id_cuenta,
        sku: skuClean,
        nombre: nombre.trim(),
        categoria: categoria.trim().toUpperCase() || 'GENERAL',
        
        pmayor: Number(pmayor) || 0,
        plocal: Number(plocal) || 0,
        pecom: Number(pecom) || 0,
        precio: precioDefinido,

        aplica_iva: aplicaIva,
        iva: tarifaAplicada,
        base_gravable_estimada: base,
        iva_monto_estimado: iva,

        costo_importacion: Number(costoImportacion) || 0,
        costo_fulfilment: Number(costoFulfilment) || 0,
        costo_total: (Number(costoImportacion) || 0) + (Number(costoFulfilment) || 0),

        imagen_url: imagenUrl.trim(),
        stock: stockMap,
        historial_cambios: historialActualizado,
        fecha_actualizacion: fechaActualISO
      };

      await setDoc(doc(db, 'productos', skuClean), prodObj, { merge: true });
      setShowModal(false);
      alert(editingSku ? '¡Producto e IVA actualizados con éxito!' : '¡Producto registrado con éxito!');
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar el producto en Firestore: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, p: any) => {
    e.stopPropagation();
    if (!confirm(`¿Estás seguro de eliminar el producto ${p.nombre} (SKU: ${p.sku})?`)) return;

    try {
      await deleteDoc(doc(db, 'productos', p.sku));
    } catch (err: any) {
      console.error(err);
      alert('Error al eliminar producto: ' + err.message);
    }
  };

  // DESCARGAR PLANTILLA CSV INCLUYENDO COLUMNAS DE COSTOS Y FULFILLMENT
  const handleDescargarPlantillaProductos = () => {
    const bom = '\uFEFF';
    const csvContent = 
      'SEP=;\n' +
      'sku;nombre;categoria;precio_al_por_mayor;precio_tienda_fisica;precio_ecommerce;iva_incluido;iva_porcentaje;costo_importacion_o_fabricacion;costo_fulfilment;stock_total;sede\n' +
      'PROD-101;Juego de Cubiertos 24pz;HOGAR;85000;129000;119000;SI;19;45000;8000;50;Sede Principal\n' +
      'PROD-102;Termo Digital Temperatura;TECNOLOGIA;38000;64990;59900;SI;19;18000;5000;30;Bodega Norte\n' +
      'PROD-103;Arroz Especial 1kg;ALIMENTOS;3500;4500;4200;NO;0;2000;500;100;Sede Principal\n';

    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Plantilla_Multibodega_Productos_ATOM_Costos_IVA.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PROCESAR CARGA MASIVA CSV CON DETECCIÓN Y ACTUALIZACIÓN INTELIGENTE DE SKU DUPLICADOS
  const handleProcesarCargaMasiva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileMasivo) return alert('Por favor selecciona un archivo CSV o Excel.');

    setLoadingMasivo(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split('\n')
          .map(l => l.trim())
          .filter(l => l !== '' && !l.toLowerCase().startsWith('sep='));

        if (lines.length <= 1) {
          alert('El archivo está vacío o solo contiene encabezados.');
          setLoadingMasivo(false);
          return;
        }

        const separador = lines[0].includes(';') ? ';' : ',';
        const idSedeDefecto = userAuth?.id_sucursal || (sucursales.length > 0 ? sucursales[0].id_sucursal : 'SUC_PRINCIPAL');
        let nuevosCreados = 0;
        let actualizados = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length >= 2 && cols[0] !== '') {
            const skuClean = cols[0].toUpperCase();
            const nombreProd = cols[1] || 'Producto Sin Nombre';
            const catProd = (cols[2] || 'GENERAL').toUpperCase();
            const precioMayor = parseMontoPuro(cols[3]);
            const precioFisica = parseMontoPuro(cols[4]) || precioMayor;
            const precioEcom = parseMontoPuro(cols[5]) || precioFisica;

            // RECONOCIMIENTO DE IVA
            const ivaIncluText = (cols[6] || 'SI').toUpperCase();
            const aplicaIvaBool = ivaIncluText === 'SI' || ivaIncluText === '1' || ivaIncluText === 'TRUE';
            const tarifaIvaNum = aplicaIvaBool ? (parseMontoPuro(cols[7]) || 19) : 0;

            // COSTOS DE FABRICACIÓN / COMPRA Y FULFILLMENT
            const costoImp = parseMontoPuro(cols[8]);
            const costoFul = parseMontoPuro(cols[9]);
            const stockCant = parseMontoPuro(cols[10]);
            const sedeNombreInput = cols[11] || '';

            let idSedeDestino = idSedeDefecto;
            if (sedeNombreInput) {
              const sucMat = sucursales.find(s => 
                s.id_sucursal === sedeNombreInput || 
                (s.nombre || s.NOMBRE || '').toLowerCase() === sedeNombreInput.toLowerCase()
              );
              if (sucMat) {
                idSedeDestino = sucMat.id_sucursal;
              }
            }

            const { base, iva } = calcularBaseEIVA(precioFisica, tarifaIvaNum, aplicaIvaBool);

            // ANALIZAR SI EL SKU YA EXISTE EN FIRESTORE
            const docRef = doc(db, 'productos', skuClean);
            const docSnap = await getDoc(docRef);
            const fechaActualISO = new Date().toISOString();

            if (docSnap.exists()) {
              // ACTUALIZAR REGISTRO DUPLICADO A LA ÚLTIMA INFORMACIÓN RECIBIDA
              const dataExistente = docSnap.data();
              const stockExistente = dataExistente.stock || {};
              const historialExistente = Array.isArray(dataExistente.historial_cambios) ? dataExistente.historial_cambios : [];

              const nuevoStockActualizado = {
                ...stockExistente,
                [idSedeDestino]: stockCant // Actualiza o añade el stock para la sede indicada
              };

              const nuevoCambioActualizacion = {
                fecha: fechaActualISO,
                usuario_nombre: userAuth?.nombre || 'Usuario ATOM',
                usuario_id: userAuth?.id_usuario || '',
                usuario_rol: userAuth?.rol || 'ADMIN',
                motivo: `Actualización Masiva via CSV (Valores y Stock en Sede: ${idSedeDestino})`
              };

              const prodActualizadoObj = {
                id_cuenta: userAuth.id_cuenta,
                sku: skuClean,
                nombre: nombreProd,
                categoria: catProd,
                pmayor: precioMayor,
                plocal: precioFisica,
                pecom: precioEcom,
                precio: precioFisica,

                aplica_iva: aplicaIvaBool,
                iva: tarifaIvaNum,
                base_gravable_estimada: base,
                iva_monto_estimado: iva,

                costo_importacion: costoImp,
                costo_fulfilment: costoFul,
                costo_total: costoImp + costoFul,
                stock: nuevoStockActualizado,
                historial_cambios: [nuevoCambioActualizacion, ...historialExistente],
                fecha_actualizacion: fechaActualISO
              };

              await setDoc(docRef, prodActualizadoObj, { merge: true });
              actualizados++;
            } else {
              // CREAR NUEVO REGISTRO DESDE CERO
              const prodNuevoObj = {
                id_cuenta: userAuth.id_cuenta,
                sku: skuClean,
                nombre: nombreProd,
                categoria: catProd,
                pmayor: precioMayor,
                plocal: precioFisica,
                pecom: precioEcom,
                precio: precioFisica,

                aplica_iva: aplicaIvaBool,
                iva: tarifaIvaNum,
                base_gravable_estimada: base,
                iva_monto_estimado: iva,

                costo_importacion: costoImp,
                costo_fulfilment: costoFul,
                costo_total: costoImp + costoFul,
                stock: {
                  [idSedeDestino]: stockCant
                },
                historial_cambios: [
                  {
                    fecha: fechaActualISO,
                    usuario_nombre: userAuth?.nombre || 'Usuario ATOM',
                    usuario_id: userAuth?.id_usuario || '',
                    usuario_rol: userAuth?.rol || 'ADMIN',
                    motivo: `Carga Masiva via CSV (Creación Inicial)`
                  }
                ],
                fecha_actualizacion: fechaActualISO
              };

              await setDoc(docRef, prodNuevoObj, { merge: true });
              nuevosCreados++;
            }
          }
        }

        alert(`¡Procesamiento Masivo Exitoso!\n\n✨ Nuevos Registrados: ${nuevosCreados}\n🔄 Duplicados Actualizados a última versión: ${actualizados}`);
        setFileMasivo(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setShowModalMasivo(false);
      } catch (err: any) {
        console.error(err);
        alert('Error en la carga masiva: ' + err.message);
      } finally {
        setLoadingMasivo(false);
      }
    };

    reader.readAsText(fileMasivo);
  };

  // Filtrado de Productos
  const productosFiltrados = productos.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch = String(p.nombre || '').toLowerCase().includes(q) || String(p.sku || '').toLowerCase().includes(q) || String(p.categoria || '').toLowerCase().includes(q);
    
    if (!matchSearch) return false;

    const stockTotal = obtenerStockTotalProducto(p, bodegaFiltro);
    const diasSinMov = obtenerDiasSinMovimiento(p.sku);

    if (filtroStockRotacion === 'BAJO_STOCK') return stockTotal <= 5;
    if (filtroStockRotacion === 'INTERMEDIO') return stockTotal > 5 && stockTotal <= 20;
    if (filtroStockRotacion === 'INACTIVO_60') return diasSinMov >= 60;
    if (filtroStockRotacion === 'INACTIVO_90') return diasSinMov >= 90;
    if (filtroStockRotacion === 'INACTIVO_120') return diasSinMov >= 120;

    return true;
  });

  const totalBajoStockCount = productos.filter(p => obtenerStockTotalProducto(p) <= 5).length;
  const totalInactivos120Count = productos.filter(p => obtenerDiasSinMovimiento(p.sku) >= 120).length;
  const valorTotalInventario = productos.reduce((acc, p) => acc + (obtenerStockTotalProducto(p) * (p.plocal || p.precio || 0)), 0);

  const sedesFormulario = obtenerSedesAutorizadasUsuario();

  // Valores calculados en el formulario activo
  const precioReferenciaForm = Number(plocal) || Number(pecom) || Number(pmayor) || 0;
  const tarifaCalculoForm = aplicaIva ? Number(tarifaIva) : 0;
  const desgloseForm = calcularBaseEIVA(precioReferenciaForm, tarifaCalculoForm, aplicaIva);

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#0DE8C0] animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              Catálogo Multibodega & Estructura de Precios con IVA
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            Consolidado de Productos
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular max-w-xl">
            Administración de precios finales, desgloses de IVA ajustados automáticamente y control multibodega.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowModalMasivo(true)}
            className="bg-transparent hover:bg-[#253443] border border-[#6884C5] text-[#6884C5] hover:text-white font-satoshi-black px-4 py-3 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 flex items-center gap-2"
          >
            {/* ÍCONO 2D PLANO: SUBIR / CARGA */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span>Carga Masiva</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-emerald-950/40 flex items-center gap-2 shrink-0"
          >
            {/* ÍCONO 2D PLANO: MAS / AGREGAR */}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Nuevo Producto</span>
          </button>
        </div>
      </div>

      {/* METRICAS SUPERIORES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[9.5rem] space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              VALOR COMERCIAL TOTAL
            </span>
            <span className="bg-[#1D2935] border border-[#0DE8C0]/40 text-[#0DE8C0] text-[10px] font-satoshi-black px-2.5 py-0.5 rounded-full uppercase">
              {productos.length} {productos.length === 1 ? 'Producto' : 'Productos'}
            </span>
          </div>

          <div>
            <div className="text-3xl font-black text-white font-satoshi-black leading-tight tracking-tight">
              {formatoCOP(valorTotalInventario)}
            </div>
          </div>

          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            Valoración final con impuestos incluidos
          </p>
        </div>

        <div className={`bg-[#253443] border rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[9.5rem] space-y-3 transition-colors ${
          totalBajoStockCount > 0 ? 'border-amber-500/50' : 'border-slate-700/50'
        }`}>
          <div className="flex justify-between items-start">
            <span className={`text-[11px] font-satoshi-black uppercase tracking-wider ${
              totalBajoStockCount > 0 ? 'text-amber-400' : 'text-[#A0AEC0]'
            }`}>
              REQUIEREN REPOSICIÓN
            </span>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              totalBajoStockCount > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-[#1D2935] text-slate-500'
            }`}>
              {/* ÍCONO 2D PLANO: ALERTA */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>

          <div>
            <div className={`text-4xl font-black font-satoshi-black leading-tight ${
              totalBajoStockCount > 0 ? 'text-amber-300' : 'text-slate-300'
            }`}>
              {totalBajoStockCount} <span className="text-sm font-satoshi-regular text-[#A0AEC0]">SKUs</span>
            </div>
          </div>

          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            Productos con 5 o menos unidades disponibles
          </p>
        </div>

        <div className={`bg-[#253443] border rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[9.5rem] space-y-3 transition-colors ${
          totalInactivos120Count > 0 ? 'border-red-500/50' : 'border-slate-700/50'
        }`}>
          <div className="flex justify-between items-start">
            <span className={`text-[11px] font-satoshi-black uppercase tracking-wider ${
              totalInactivos120Count > 0 ? 'text-red-400' : 'text-[#A0AEC0]'
            }`}>
              ESTANCADOS (120+ DÍAS)
            </span>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              totalInactivos120Count > 0 ? 'bg-red-500/10 text-red-400' : 'bg-[#1D2935] text-slate-500'
            }`}>
              {/* ÍCONO 2D PLANO: RELOJ PAUSA */}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div>
            <div className={`text-4xl font-black font-satoshi-black leading-tight ${
              totalInactivos120Count > 0 ? 'text-red-400' : 'text-slate-300'
            }`}>
              {totalInactivos120Count} <span className="text-sm font-satoshi-regular text-[#A0AEC0]">SKUs</span>
            </div>
          </div>

          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            Sin movimiento registrado hace más de 4 meses
          </p>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-4 mb-8 space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto flex-1">
            <div className="relative flex-1 max-w-md">
              {/* ÍCONO 2D PLANO: BÚSQUEDA */}
              <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text" 
                className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-[#A0AEC0] focus:outline-none font-satoshi-regular transition"
                placeholder="Buscar por SKU, Nombre o Categoría..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 bg-[#1D2935] border border-slate-700 rounded-xl px-3 py-1.5">
              <span className="text-[10px] font-satoshi-black text-[#A0AEC0] uppercase">Sede:</span>
              <select
                className="bg-transparent text-xs text-[#0DE8C0] font-satoshi-black focus:outline-none cursor-pointer"
                value={bodegaFiltro}
                onChange={(e) => setBodegaFiltro(e.target.value)}
              >
                <option value="TODAS" className="bg-[#1D2935] text-white">Todas las Sedes</option>
                {sucursales.filter(s => s.estado !== 'INACTIVA').map((s, idx) => (
                  <option key={s.id_sucursal || idx} value={s.id_sucursal} className="bg-[#1D2935] text-white">
                    {s.nombre || s.NOMBRE}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-[#1D2935] p-1 rounded-xl flex items-center gap-1 shrink-0 border border-slate-700/60">
            <button
              type="button"
              onClick={() => setViewMode('TABLA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition flex items-center gap-1.5 ${
                viewMode === 'TABLA'
                  ? 'bg-[#0DE8C0] text-[#1D2935]'
                  : 'text-[#A0AEC0] hover:text-white'
              }`}
            >
              {/* ÍCONO 2D PLANO: VISTA TABLA */}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span>Vista Tabla</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('TARJETAS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-satoshi-black transition flex items-center gap-1.5 ${
                viewMode === 'TARJETAS'
                  ? 'bg-[#0DE8C0] text-[#1D2935]'
                  : 'text-[#A0AEC0] hover:text-white'
              }`}
            >
              {/* ÍCONO 2D PLANO: VISTA CUADRÍCULA */}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span>Vista Tarjetas</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-700/60">
          <span className="text-[10px] font-satoshi-black text-[#A0AEC0] uppercase pr-2">Filtros Inteligentes:</span>
          
          <button
            onClick={() => setFiltroStockRotacion('TODOS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black transition ${
              filtroStockRotacion === 'TODOS'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Todos ({productos.length})
          </button>

          <button
            onClick={() => setFiltroStockRotacion('BAJO_STOCK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black transition ${
              filtroStockRotacion === 'BAJO_STOCK'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Bajo Stock (&lt;= 5)
          </button>

          <button
            onClick={() => setFiltroStockRotacion('INTERMEDIO')}
            className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black transition ${
              filtroStockRotacion === 'INTERMEDIO'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Stock Intermedio (6 - 20)
          </button>

          <button
            onClick={() => setFiltroStockRotacion('INACTIVO_60')}
            className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black transition ${
              filtroStockRotacion === 'INACTIVO_60'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Sin Movimiento 60+ Días
          </button>

          <button
            onClick={() => setFiltroStockRotacion('INACTIVO_90')}
            className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black transition ${
              filtroStockRotacion === 'INACTIVO_90'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Sin Movimiento 90+ Días
          </button>

          <button
            onClick={() => setFiltroStockRotacion('INACTIVO_120')}
            className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black transition ${
              filtroStockRotacion === 'INACTIVO_120'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            Sin Movimiento 120+ Días
          </button>
        </div>
      </div>

      {/* VISTA TABLA */}
      {viewMode === 'TABLA' && (
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl shadow-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1D2935] text-[11px] font-satoshi-black text-[#A0AEC0] uppercase tracking-wider border-b border-slate-700">
                <th className="p-4">Producto / SKU</th>
                <th className="p-4">Categoría</th>
                <th className="p-4 text-center">Stock Total</th>
                <th className="p-4 text-right">Precio Final POS</th>
                <th className="p-4 text-center">Tarifa IVA</th>
                <th className="p-4 text-right">Base Gravable</th>
                <th className="p-4 text-right">Monto IVA</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 text-xs font-satoshi-regular">
              {productosFiltrados.map((p, idx) => {
                const stockTot = obtenerStockTotalProducto(p, bodegaFiltro);
                const precioFinal = p.plocal || p.precio || 0;
                const tarifaIva = p.iva !== undefined ? Number(p.iva) : 19;
                const tieneIva = p.aplica_iva !== undefined ? p.aplica_iva : true;
                
                const { base, iva } = calcularBaseEIVA(precioFinal, tieneIva ? tarifaIva : 0, tieneIva);

                return (
                  <tr 
                    key={p.sku || idx} 
                    onClick={() => handleOpenEdit(p)}
                    className="hover:bg-[#1D2935]/80 transition-colors cursor-pointer"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#1D2935] border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                          {p.imagen_url ? (
                            <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover" />
                          ) : (
                            /* ÍCONO 2D PLANO: ETIQUETA / PRODUCTO */
                            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="font-satoshi-black text-white uppercase text-sm">{p.nombre}</div>
                          <div className="font-mono text-[10px] text-[#0DE8C0]">SKU: {p.sku}</div>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <span className="text-[10px] font-satoshi-black uppercase bg-[#1D2935] text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                        {p.categoria || 'GENERAL'}
                      </span>
                    </td>

                    <td className="p-4 text-center font-satoshi-black">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] ${
                        stockTot <= 5 
                          ? 'bg-red-950/60 text-red-400 border border-red-800/40' 
                          : (stockTot <= 20 ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40' : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40')
                      }`}>
                        {stockTot} unds
                      </span>
                    </td>

                    <td className="p-4 text-right font-satoshi-black text-white">
                      {formatoCOP(precioFinal)}
                    </td>

                    <td className="p-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-satoshi-black ${
                        tieneIva && tarifaIva > 0
                          ? 'bg-[#0DE8C0]/10 text-[#0DE8C0] border border-[#0DE8C0]/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {tieneIva ? `${tarifaIva}% IVA` : '0% (Exento)'}
                      </span>
                    </td>

                    <td className="p-4 text-right font-mono text-slate-300">
                      {formatoCOP(base)}
                    </td>

                    <td className="p-4 text-right font-mono text-[#0DE8C0]">
                      {formatoCOP(iva)}
                    </td>

                    <td className="p-4 text-center">
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, p)}
                        className="p-1.5 text-red-400 hover:bg-red-950/40 rounded-lg transition"
                        title="Eliminar producto"
                      >
                        {/* ÍCONO 2D PLANO: TRASH */}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {productosFiltrados.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[#A0AEC0] text-xs">
                    No se encontraron productos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VISTA TARJETAS */}
      {viewMode === 'TARJETAS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {productosFiltrados.map((p, idx) => {
            const stockTot = obtenerStockTotalProducto(p, bodegaFiltro);
            const precioFinal = p.plocal || p.precio || 0;
            const tarifaIva = p.iva !== undefined ? Number(p.iva) : 19;
            const tieneIva = p.aplica_iva !== undefined ? p.aplica_iva : true;
            const { base, iva } = calcularBaseEIVA(precioFinal, tieneIva ? tarifaIva : 0, tieneIva);

            return (
              <div
                key={p.sku || idx}
                onClick={() => handleOpenEdit(p)}
                className="group relative bg-[#253443] border border-slate-700/50 hover:border-[#0DE8C0]/40 rounded-2xl p-5 shadow-xl flex flex-col justify-between transition-all duration-300 cursor-pointer"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="font-mono text-[11px] font-satoshi-black text-[#0DE8C0] bg-[#1D2935] px-2.5 py-0.5 rounded border border-slate-700">
                      SKU: {p.sku}
                    </span>

                    <span className={`text-[10px] font-satoshi-black px-2.5 py-0.5 rounded-full ${
                      stockTot <= 5 
                        ? 'bg-red-950/80 text-red-300 border border-red-800/40' 
                        : (stockTot <= 20 ? 'bg-amber-950/80 text-amber-300 border border-amber-800/40' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40')
                    }`}>
                      {stockTot} unds
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-[#1D2935] border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                      {p.imagen_url ? (
                        <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover" />
                      ) : (
                        /* ÍCONO 2D PLANO: ETIQUETA / PRODUCTO */
                        <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                      )}
                    </div>
                    <div className="truncate">
                      <h3 className="font-satoshi-black text-sm text-white uppercase truncate">
                        {p.nombre}
                      </h3>
                      <p className="text-[10px] text-[#A0AEC0] font-satoshi-black uppercase">
                        Cat: {p.categoria || 'GENERAL'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#1D2935] p-3 rounded-xl border border-slate-700/80 space-y-2 text-xs">
                    <div className="flex justify-between items-center border-b border-slate-700/60 pb-1.5">
                      <span className="text-[10px] text-[#A0AEC0] uppercase font-satoshi-black">Precio Final Venta:</span>
                      <span className="font-satoshi-black text-white text-sm">{formatoCOP(precioFinal)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>Base Gravable: <span className="font-mono text-slate-200 block">{formatoCOP(base)}</span></div>
                      <div>IVA Discriminado ({tarifaIva}%): <span className="font-mono text-[#0DE8C0] block">{formatoCOP(iva)}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CREAR / EDITAR PRODUCTO CON SELECCIÓN DE IVA Y UNIT ECONOMICS */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl font-sans max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center mb-4 border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase tracking-wide">
                {editingSku ? `Editar SKU: ${editingSku}` : 'Nuevo Producto'}
              </h3>

              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {editingSku && (
              <div className="bg-[#1D2935] p-1 rounded-xl flex items-center gap-1 border border-slate-700 mb-4">
                <button
                  type="button"
                  onClick={() => setActiveModalTab('DATOS')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                    activeModalTab === 'DATOS'
                      ? 'bg-[#0DE8C0] text-[#1D2935]'
                      : 'text-[#A0AEC0] hover:text-white'
                  }`}
                >
                  ✏️ Formulario de Edición
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalTab('HISTORIAL')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-satoshi-black transition ${
                    activeModalTab === 'HISTORIAL'
                      ? 'bg-[#0DE8C0] text-[#1D2935]'
                      : 'text-[#A0AEC0] hover:text-white'
                  }`}
                >
                  📜 Bitácora de Cambios ({historialCambios.length})
                </button>
              </div>
            )}

            {/* FORMULARIO DE DATOS */}
            {activeModalTab === 'DATOS' && (
              <form onSubmit={handleSave} className="space-y-4">
                
                {/* SUBIDA DE IMAGEN */}
                <div className="bg-[#1D2935] border border-slate-700/80 rounded-xl p-4 space-y-3">
                  <label className="block text-xs font-satoshi-black text-[#0DE8C0] uppercase">
                    🖼️ Imagen del Producto
                  </label>

                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl bg-[#253443] border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                      {imagenUrl ? (
                        <img src={imagenUrl} alt="Vista Previa" className="w-full h-full object-cover" />
                      ) : (
                        /* ÍCONO 2D PLANO: IMAGEN DEFAULT */
                        <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 002-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      <input 
                        type="file" 
                        ref={fileImageRef}
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileImageRef.current?.click()}
                        className="w-full bg-[#253443] hover:bg-[#2c3d4f] text-slate-200 border border-slate-700 font-satoshi-black py-2 rounded-lg text-xs uppercase transition flex items-center justify-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span>Subir Imagen Local</span>
                      </button>

                      <input 
                        type="text"
                        className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2 text-[11px] text-white font-satoshi-regular"
                        placeholder="O pega una URL: https://..."
                        value={imagenUrl}
                        onChange={(e) => setImagenUrl(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">Código SKU *</label>
                  <input 
                    type="text"
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white font-mono focus:outline-none disabled:opacity-50"
                    placeholder="PROD-001"
                    value={skuInput}
                    onChange={(e) => setSkuInput(e.target.value)}
                    disabled={!!editingSku}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">Nombre del Producto *</label>
                  <input 
                    type="text"
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-satoshi-regular"
                    placeholder="Ej: Teclado Mecánico RGB"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">Categoría</label>
                  <input 
                    type="text"
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white font-satoshi-regular uppercase"
                    placeholder="TECNOLOGIA"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                  />
                </div>

                {/* ASIGNACIÓN DE INVENTARIO */}
                <div className="bg-[#1D2935] border border-slate-700 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-satoshi-black text-[#0DE8C0] uppercase">
                      📦 Asignación de Stock por Sede
                    </label>
                    <span className="text-[10px] text-[#A0AEC0] font-mono">
                      Subtotal: {sedesFormulario.reduce((acc, s) => acc + Number(stockMap[s.id_sucursal] || 0), 0)} unds
                    </span>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {sedesFormulario.map((suc, i) => (
                      <div key={suc.id_sucursal || i} className="bg-[#253443] border border-slate-700/80 p-2.5 rounded-lg flex items-center justify-between gap-3 text-xs">
                        <span className="font-satoshi-black text-white truncate">
                          📍 {suc.nombre || suc.NOMBRE || `Sede ${suc.id_sucursal}`}
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <input 
                            type="number"
                            min="0"
                            className="w-24 bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-1.5 text-center font-mono text-white text-xs"
                            value={stockMap[suc.id_sucursal] !== undefined ? stockMap[suc.id_sucursal] : 0}
                            onChange={(e) => handleStockSedeChange(suc.id_sucursal, Number(e.target.value))}
                          />
                          <span className="text-[10px] text-slate-400">unds</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ESTRUCTURA DE PRECIOS */}
                <div className="bg-[#1D2935] border border-slate-700 p-4 rounded-xl space-y-3">
                  <label className="block text-xs font-satoshi-black text-[#0DE8C0] uppercase">
                    🏷️ Estructura de Precios Finales (Cliente)
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-satoshi-black text-[#0DE8C0] mb-1 uppercase">Por Mayor ($)</label>
                      <input 
                        type="number"
                        className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none"
                        placeholder="85000"
                        value={pmayor}
                        onChange={(e) => setPmayor(e.target.value ? Number(e.target.value) : '')}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-satoshi-black text-white mb-1 uppercase">Tienda POS ($)</label>
                      <input 
                        type="number"
                        className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none"
                        placeholder="129000"
                        value={plocal}
                        onChange={(e) => setPlocal(e.target.value ? Number(e.target.value) : '')}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-satoshi-black text-[#6884C5] mb-1 uppercase">E-Commerce ($)</label>
                      <input 
                        type="number"
                        className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none"
                        placeholder="119000"
                        value={pecom}
                        onChange={(e) => setPecom(e.target.value ? Number(e.target.value) : '')}
                      />
                    </div>
                  </div>
                </div>

                {/* UNIT ECONOMICS: COSTO DE FABRICACIÓN/COMPRA Y FULFILLMENT */}
                <div className="bg-[#1D2935] border border-slate-700 p-4 rounded-xl space-y-3">
                  <label className="block text-xs font-satoshi-black text-[#0DE8C0] uppercase">
                    💰 Unit Economics (Costos Unitarios)
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-satoshi-black text-[#A0AEC0] mb-1 uppercase">
                        Costo Fabricación / Compra ($)
                      </label>
                      <input 
                        type="number"
                        min="0"
                        className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none"
                        placeholder="45000"
                        value={costoImportacion}
                        onChange={(e) => setCostoImportacion(e.target.value ? Number(e.target.value) : '')}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-satoshi-black text-[#A0AEC0] mb-1 uppercase">
                        Costo Fulfillment / Operación ($)
                      </label>
                      <input 
                        type="number"
                        min="0"
                        className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none"
                        placeholder="8000"
                        value={costoFulfilment}
                        onChange={(e) => setCostoFulfilment(e.target.value ? Number(e.target.value) : '')}
                      />
                    </div>
                  </div>
                </div>

                {/* MÓDULO DE CONFIGURACIÓN DE IVA */}
                <div className="bg-[#1D2935] border border-slate-700 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-satoshi-black text-[#0DE8C0] uppercase">
                      🏛️ Impuesto al Valor Agregado (IVA)
                    </label>

                    <div className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        id="checkAplicaIva"
                        checked={aplicaIva}
                        onChange={(e) => setAplicaIva(e.target.checked)}
                        className="rounded bg-[#253443] border-slate-700 text-[#0DE8C0] focus:ring-0 w-4 h-4 cursor-pointer"
                      />
                      <label htmlFor="checkAplicaIva" className="text-xs font-satoshi-black text-slate-200 cursor-pointer">
                        ¿Precio Incluye IVA?
                      </label>
                    </div>
                  </div>

                  {aplicaIva && (
                    <div className="space-y-3 pt-2">
                      <div>
                        <label className="block text-[10px] font-satoshi-black text-slate-300 uppercase mb-1">
                          Tarifa de IVA Aplicable
                        </label>
                        <select
                          className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-satoshi-black focus:outline-none"
                          value={tarifaIva}
                          onChange={(e) => setTarifaIva(Number(e.target.value))}
                        >
                          <option value={19}>IVA 19% (Tarifa General)</option>
                          <option value={5}>IVA 5% (Tarifa Reducida)</option>
                          <option value={0}>IVA 0% (Exento / Excluido)</option>
                        </select>
                      </div>

                      {/* DESGLOSE EN TIEMPO REAL */}
                      <div className="bg-[#253443] p-3 rounded-lg border border-slate-700/80 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Precio Final Definido:</span>
                          <span className="font-satoshi-black text-white">{formatoCOP(precioReferenciaForm)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Base Gravable Ajustada:</span>
                          <span className="font-mono text-slate-200">{formatoCOP(desgloseForm.base)}</span>
                        </div>
                        <div className="flex justify-between text-[#0DE8C0] font-satoshi-black pt-1 border-t border-slate-700">
                          <span>IVA Discriminado ({tarifaIva}%):</span>
                          <span>{formatoCOP(desgloseForm.iva)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* JUSTIFICACIÓN / MOTIVO DE LA EDICIÓN */}
                {editingSku && (
                  <div className="bg-[#1D2935] border border-[#C81FDA]/60 p-4 rounded-xl space-y-2">
                    <label className="block text-xs font-satoshi-black text-[#C81FDA] uppercase flex items-center gap-1.5">
                      <span>⚠️ Motivo / Justificación de la Edición *</span>
                    </label>
                    <textarea
                      rows={2}
                      className="w-full bg-[#253443] border border-slate-700 focus:border-[#C81FDA] rounded-xl p-2.5 text-xs text-white placeholder-[#A0AEC0] focus:outline-none font-satoshi-regular"
                      placeholder="Ej: Ajuste de costo de fabricación / Cambio de tarifa de IVA..."
                      value={motivoEdicion}
                      onChange={(e) => setMotivoEdicion(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-slate-700/60 mt-6">
                  <button 
                    type="button" 
                    onClick={() => setShowModal(false)}
                    className="flex-1 bg-[#1D2935] text-slate-300 font-satoshi-black py-3 rounded-xl text-xs uppercase"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading || (!!editingSku && !motivoEdicion.trim())}
                    className="flex-1 bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg disabled:opacity-50"
                  >
                    {loading ? 'Guardando...' : (editingSku ? 'Guardar y Registrar Auditoría' : 'Crear Producto')}
                  </button>
                </div>
              </form>
            )}

            {/* VISTA HISTORIAL */}
            {activeModalTab === 'HISTORIAL' && (
              <div className="space-y-3 py-2">
                <p className="text-xs text-[#A0AEC0] font-satoshi-regular">
                  Registro cronológico de quién ha modificado este producto:
                </p>

                <div className="max-h-80 overflow-y-auto space-y-2.5 pr-1">
                  {historialCambios.map((cambio: any, idx: number) => (
                    <div key={idx} className="bg-[#1D2935] border border-slate-700/80 rounded-xl p-3.5 space-y-1 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-satoshi-black text-[#0DE8C0]">
                          👤 {cambio.usuario_nombre || 'Usuario'}
                        </span>
                        <span className="text-[10px] font-mono text-[#A0AEC0]">
                          {cambio.fecha ? new Date(cambio.fecha).toLocaleString() : 'N/A'}
                        </span>
                      </div>

                      <p className="text-slate-200 font-satoshi-regular bg-[#253443] p-2 rounded-lg border border-slate-700/60 mt-1">
                        &quot;{cambio.motivo || 'Sin motivo ingresado'}&quot;
                      </p>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-slate-700/60">
                  <button 
                    type="button" 
                    onClick={() => setActiveModalTab('DATOS')}
                    className="w-full bg-[#1D2935] text-slate-300 font-satoshi-black py-2.5 rounded-xl text-xs uppercase"
                  >
                    Volver al Formulario
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MODAL CARGA MASIVA CON SOPORTE DE COSTOS E IVA Y ACTUALIZACIÓN INTELIGENTE */}
      {showModalMasivo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl font-sans">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase">Carga Masiva de Productos</h3>
              <button onClick={() => setShowModalMasivo(false)} className="text-slate-400 hover:text-white transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleProcesarCargaMasiva} className="space-y-4">
              <div className="bg-[#1D2935] border border-slate-700/80 rounded-xl p-4 text-xs text-slate-300 space-y-2">
                <p className="font-satoshi-black text-white">PASO 1: Descarga la plantilla estructurada</p>
                <p className="text-[11px] text-[#A0AEC0]">Soporta Sede, Precios, Costos e IVA. Si un SKU ya existe, actualizará automáticamente sus valores e inventario.</p>
                <button 
                  type="button"
                  onClick={handleDescargarPlantillaProductos}
                  className="bg-[#6884C5] text-white font-satoshi-black px-4 py-2 rounded-xl text-xs uppercase shadow hover:bg-[#5772b0] transition flex items-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Descargar Plantilla CSV</span>
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-700/80 rounded-xl p-6 text-center space-y-2 bg-[#1D2935]">
                <p className="font-satoshi-black text-xs text-white">PASO 2: Adjunta tu archivo (.csv)</p>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept=".csv"
                  onChange={(e) => setFileMasivo(e.target.files ? e.target.files[0] : null)}
                  className="text-xs text-[#A0AEC0]"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-700/60">
                <button 
                  type="button" 
                  onClick={() => setShowModalMasivo(false)}
                  className="flex-1 bg-[#1D2935] text-slate-300 font-satoshi-black py-3 rounded-xl text-xs uppercase"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={loadingMasivo || !fileMasivo}
                  className="flex-1 bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {loadingMasivo ? 'Importando...' : '⚡ Procesar e Indexar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
