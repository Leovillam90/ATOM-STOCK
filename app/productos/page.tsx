'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function ProductosPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [productos, setProductos] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [ventas, setVentas] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // LISTA OFICIAL DE CATEGORÍAS PREDEFINIDAS
  const CATEGORIAS_OFICIALES = [
    'ALIMENTOS', 'AUTOMOTRIZ Y HERRAMIENTAS', 'BEBES Y JUGUETES', 'BELLEZA Y CUIDADO', 
    'DEPORTES', 'FERRETERIA', 'HOGAR', 'MASCOTAS', 'MODA', 'OFICINA Y PAPELERIA', 
    'SALUD', 'TECNOLOGIA'
  ];

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
  const [categoria, setCategoria] = useState('TECNOLOGIA');
  
  // TRES NIVELES DE PRECIOS
  const [pmayor, setPmayor] = useState<number | ''>('');
  const [plocal, setPlocal] = useState<number | ''>('');
  const [pecom, setPecom] = useState<number | ''>('');

  // CONFIGURACIÓN DE IVA EN EL PRODUCTO
  const [aplicaIva, setAplicaIva] = useState<boolean>(true);
  const [tarifaIva, setTarifaIva] = useState<number>(19);

  // COSTOS UNITARIOS
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

  // ESCUCHAR FIRESTORE
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const qProd = query(collection(db, 'productos'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubProd = onSnapshot(qProd, (snap) => setProductos(snap.docs.map(d => ({ ...d.data(), sku: d.id }))), (err) => console.error(err));

    const qSuc = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubSuc = onSnapshot(qSuc, (snap) => setSucursales(snap.docs.map(d => ({ ...d.data(), id_doc: d.id }))), (err) => console.error(err));

    const qVent = query(collection(db, 'ventas'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubVent = onSnapshot(qVent, (snap) => setVentas(snap.docs.map(d => d.data())), (err) => console.error(err));

    return () => {
      unsubProd();
      unsubSuc();
      unsubVent();
    };
  }, [userAuth]);

  // ==========================================
  // 🧠 RENDIMIENTO: LÓGICA DE FILTROS INTELIGENTES Y MÉTRICAS
  // ==========================================

  // 1. Auxiliar de Stock Total por Sede
  const obtenerStockTotalProducto = (p: any, idBod?: string) => {
    const stMap = p.stock || {};
    if (idBod && idBod !== 'TODAS') return Number(stMap[idBod] || 0);
    return Object.values(stMap).reduce((acc: number, val: any) => acc + (Number(val) || 0), 0);
  };

  // 2. Memoizamos los días sin venta para no recalcularlos con cada letra
  const diasSinVentaPorSku = useMemo(() => {
    const map: { [sku: string]: number } = {};
    const hoyMs = new Date().getTime();

    ventas.forEach(v => {
      // Ignorar ventas anuladas para no reiniciar el contador de días inactivos
      if (String(v.estado || '').toUpperCase() === 'ANULADA') return;

      const ms = v.fecha_cobro || v.fecha ? new Date(v.fecha_cobro || v.fecha).getTime() : 0;
      if (ms === 0) return;

      const procesarItem = (sku: string) => {
        if (!map[sku] || ms > map[sku]) map[sku] = ms;
      };

      if (Array.isArray(v.items)) {
        v.items.forEach((it: any) => procesarItem(it.sku));
      } else if (v.sku) {
        procesarItem(v.sku);
      }
    });

    const resultado: { [sku: string]: number } = {};
    productos.forEach(p => {
      const maxMs = map[p.sku];
      resultado[p.sku] = maxMs ? Math.max(0, Math.floor((hoyMs - maxMs) / (1000 * 60 * 60 * 24))) : 999;
    });

    return resultado;
  }, [ventas, productos]);

  // 3. Tarjetas KPI Superiores (Estables, solo reaccionan a la Bodega, ignoran la caja de búsqueda)
  const kpis = useMemo(() => {
    let cBajo = 0;
    let cIna120 = 0;
    let vTotal = 0;

    productos.forEach(p => {
      const stockTotal = obtenerStockTotalProducto(p, bodegaFiltro);
      const diasSinMov = diasSinVentaPorSku[p.sku] ?? 999;

      if (stockTotal <= 5) cBajo++;
      // Corrección lógica: Solo cuenta como estancado si REALMENTE tiene stock
      if (stockTotal > 0 && diasSinMov >= 120) cIna120++; 
      vTotal += stockTotal * (p.plocal || p.precio || 0);
    });

    return {
      totalBajoStockCount: cBajo,
      totalInactivos120Count: cIna120,
      valorTotalInventario: vTotal
    };
  }, [productos, bodegaFiltro, diasSinVentaPorSku]);

  // 4. Filtros de Tabla y Píldoras Dinámicas (Reaccionan a Búsqueda y Bodega al mismo tiempo)
  const { productosFiltrados, countsFiltros } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    let cTodos = 0, cBajo = 0, cInter = 0, cIna60 = 0, cIna90 = 0, cIna120 = 0;

    const filtrados = productos.filter(p => {
      const matchSearch = String(p.nombre || '').toLowerCase().includes(q) || 
                          String(p.sku || '').toLowerCase().includes(q) || 
                          String(p.categoria || '').toLowerCase().includes(q);
      
      if (!matchSearch) return false;

      const stockTotal = obtenerStockTotalProducto(p, bodegaFiltro);
      const diasSinMov = diasSinVentaPorSku[p.sku] ?? 999;

      // Alimentamos los contadores dinámicos de los botones
      cTodos++;
      if (stockTotal <= 5) cBajo++;
      if (stockTotal > 5 && stockTotal <= 20) cInter++;
      
      // Corrección lógica: Los productos sin movimiento deben tener stock > 0
      if (stockTotal > 0) {
        if (diasSinMov >= 60) cIna60++;
        if (diasSinMov >= 90) cIna90++;
        if (diasSinMov >= 120) cIna120++;
      }

      // Aplicamos el filtro seleccionado a la tabla
      if (filtroStockRotacion === 'BAJO_STOCK') return stockTotal <= 5;
      if (filtroStockRotacion === 'INTERMEDIO') return stockTotal > 5 && stockTotal <= 20;
      if (filtroStockRotacion === 'INACTIVO_60') return diasSinMov >= 60 && stockTotal > 0;
      if (filtroStockRotacion === 'INACTIVO_90') return diasSinMov >= 90 && stockTotal > 0;
      if (filtroStockRotacion === 'INACTIVO_120') return diasSinMov >= 120 && stockTotal > 0;

      return true;
    });

    return {
      productosFiltrados: filtrados,
      countsFiltros: { todos: cTodos, bajo: cBajo, inter: cInter, ina60: cIna60, ina90: cIna90, ina120: cIna120 }
    };
  }, [productos, searchQuery, bodegaFiltro, filtroStockRotacion, diasSinVentaPorSku]);


  // ==========================================
  // LÓGICA DE FORMULARIOS Y MODALES
  // ==========================================
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return alert('La imagen no debe superar los 2MB de tamaño.');

    const reader = new FileReader();
    reader.onloadend = () => setImagenUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const obtenerSedesAutorizadasUsuario = () => {
    if (!userAuth) return [];
    if (userAuth.rol === 'ADMIN') return sucursales.filter(s => s.estado !== 'INACTIVA');

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
    setCategoria('TECNOLOGIA');
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
    sedesPermitidas.forEach(s => { if (s.id_sucursal) initialStockMap[s.id_sucursal] = 0; });

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
    
    const catUpper = String(p.categoria || '').toUpperCase().trim();
    setCategoria(CATEGORIAS_OFICIALES.includes(catUpper) ? catUpper : 'SIN CATEGORIA');
    
    setPmayor(p.pmayor !== undefined ? p.pmayor : '');
    setPlocal(p.plocal !== undefined ? p.plocal : (p.precio !== undefined ? p.precio : ''));
    setPecom(p.pecom !== undefined ? p.pecom : '');

    setAplicaIva(p.aplica_iva !== undefined ? p.aplica_iva : true);
    setTarifaIva(p.iva !== undefined ? Number(p.iva) : 19);
    
    setCostoImportacion(p.costo_importacion !== undefined ? p.costo_importacion : '');
    setCostoFulfilment(p.costo_fulfilment !== undefined ? p.costo_fulfilment : '');
    setImagenUrl(p.imagen_url || '');
    
    setStockMap(p.stock || {});
    setMotivoEdicion('');
    setHistorialCambios(Array.isArray(p.historial_cambios) ? p.historial_cambios : []);
    setActiveModalTab('DATOS');
    setShowModal(true);
  };

  const handleStockSedeChange = (idSucursal: string, cant: number) => {
    setStockMap(prev => ({ ...prev, [idSucursal]: Math.max(0, cant) }));
  };

  const calcularBaseEIVA = (precioFinal: number, tarifa: number, incluye: boolean) => {
    if (!incluye || tarifa <= 0) return { base: precioFinal, iva: 0 };
    const base = precioFinal / (1 + (tarifa / 100));
    return { base, iva: precioFinal - base };
  };

  const parseMontoPuro = (val: any) => {
    if (val === undefined || val === null) return 0;
    let numStr = String(val).replace(/[\$\s"]/g, '').trim();
    if (!numStr) return 0;
    if (numStr.includes(',')) numStr = numStr.replace(/\./g, '').replace(',', '.');
    const parsed = Number(numStr);
    return isNaN(parsed) ? 0 : parsed;
  };

  // ==========================================
  // CREACIÓN/EDICIÓN MANUAL Y ELIMINACIÓN
  // ==========================================
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skuInput.trim() || !nombre.trim()) return alert('Ingresa el SKU y el Nombre del producto.');

    const skuClean = skuInput.trim().toUpperCase();

    if (!editingSku) {
      const existeProd = productos.some(p => String(p.sku || '').toUpperCase() === skuClean);
      if (existeProd) return alert(`El SKU "${skuClean}" ya existe. Utiliza un SKU único o edita el producto.`);
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
        categoria: categoria.trim().toUpperCase() || 'SIN CATEGORIA',
        
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
      alert(editingSku ? '¡Producto actualizado con éxito!' : '¡Producto registrado con éxito!');
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar el producto: ' + err.message);
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

  // ==========================================
  // CARGA MASIVA Y EXPORTACIÓN
  // ==========================================
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

  const handleProcesarCargaMasiva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileMasivo) return alert('Por favor selecciona un archivo CSV.');

    setLoadingMasivo(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '' && !l.toLowerCase().startsWith('sep='));

        if (lines.length <= 1) {
          alert('El archivo está vacío o solo contiene encabezados.');
          setLoadingMasivo(false);
          return;
        }

        const separador = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(separador).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));

        const columnasRequeridas = ['sku', 'nombre', 'categoria', 'precio_tienda_fisica'];
        const columnasFaltantes = columnasRequeridas.filter(col => !headers.includes(col));

        if (columnasFaltantes.length > 0) {
          alert(`⛔ Formato Inválido:\nFaltan las siguientes columnas: [ ${columnasFaltantes.join(', ')} ]`);
          setLoadingMasivo(false);
          return;
        }

        const idxSku = headers.indexOf('sku');
        const idxNombre = headers.indexOf('nombre');
        const idxCat = headers.indexOf('categoria');
        const idxPMayor = headers.indexOf('precio_al_por_mayor');
        const idxPPos = headers.indexOf('precio_tienda_fisica');
        const idxPEcom = headers.indexOf('precio_ecommerce');
        const idxIvaInclu = headers.indexOf('iva_incluido');
        const idxTarifaIva = headers.indexOf('iva_porcentaje');
        const idxCostoImp = headers.indexOf('costo_importacion_o_fabricacion');
        const idxCostoFul = headers.indexOf('costo_fulfilment');
        const idxStock = headers.indexOf('stock_total');
        const idxSede = headers.indexOf('sede');

        const idSedeDefecto = userAuth?.id_sucursal || (sucursales.length > 0 ? sucursales[0].id_sucursal : 'SUC_PRINCIPAL');
        const fechaActualISO = new Date().toISOString();
        
        let nuevosCreados = 0;
        let actualizados = 0;

        const batchArray: any[] = [writeBatch(db)];
        let operacionCount = 0;
        let batchIndex = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(separador).map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length >= 2 && cols[idxSku] && cols[idxSku] !== '') {
            
            const skuClean = cols[idxSku].toUpperCase();
            const nombreProd = cols[idxNombre] || 'Producto Sin Nombre';
            
            const rawCatCsv = (cols[idxCat] || '').toUpperCase().trim();
            const catProd = CATEGORIAS_OFICIALES.includes(rawCatCsv) ? rawCatCsv : 'SIN CATEGORIA';
            
            const precioMayor = idxPMayor !== -1 ? parseMontoPuro(cols[idxPMayor]) : 0;
            const precioFisica = parseMontoPuro(cols[idxPPos]) || precioMayor;
            const precioEcom = idxPEcom !== -1 ? (parseMontoPuro(cols[idxPEcom]) || precioFisica) : precioFisica;

            const ivaIncluText = idxIvaInclu !== -1 ? (cols[idxIvaInclu] || 'SI').toUpperCase() : 'SI';
            const aplicaIvaBool = ivaIncluText === 'SI' || ivaIncluText === '1' || ivaIncluText === 'TRUE';
            const tarifaIvaNum = aplicaIvaBool ? (idxTarifaIva !== -1 ? (parseMontoPuro(cols[idxTarifaIva]) || 19) : 19) : 0;

            const costoImp = idxCostoImp !== -1 ? parseMontoPuro(cols[idxCostoImp]) : 0;
            const costoFul = idxCostoFul !== -1 ? parseMontoPuro(cols[idxCostoFul]) : 0;
            const stockCant = idxStock !== -1 ? parseMontoPuro(cols[idxStock]) : 0;
            const sedeNombreInput = idxSede !== -1 ? cols[idxSede] : '';

            let idSedeDestino = idSedeDefecto;
            if (sedeNombreInput) {
              const sucMat = sucursales.find(s => 
                s.id_sucursal === sedeNombreInput || 
                (s.nombre || s.NOMBRE || '').toLowerCase() === sedeNombreInput.toLowerCase()
              );
              if (sucMat) idSedeDestino = sucMat.id_sucursal;
            }

            const { base, iva } = calcularBaseEIVA(precioFisica, tarifaIvaNum, aplicaIvaBool);
            const docRef = doc(db, 'productos', skuClean);
            
            const prodExistente = productos.find(p => p.sku === skuClean);

            const baseObj = {
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
              fecha_actualizacion: fechaActualISO
            };

            let finalObj;

            if (prodExistente) {
              actualizados++;
              const stockPrevio = prodExistente.stock || {};
              finalObj = {
                ...baseObj,
                stock: { ...stockPrevio, [idSedeDestino]: stockCant },
                historial_cambios: [
                  {
                    fecha: fechaActualISO,
                    usuario_nombre: userAuth?.nombre || 'Usuario ATOM',
                    usuario_id: userAuth?.id_usuario || '',
                    usuario_rol: userAuth?.rol || 'ADMIN',
                    motivo: `Actualización Masiva via CSV (Sede: ${idSedeDestino})`
                  },
                  ...(Array.isArray(prodExistente.historial_cambios) ? prodExistente.historial_cambios : [])
                ]
              };
            } else {
              nuevosCreados++;
              finalObj = {
                ...baseObj,
                stock: { [idSedeDestino]: stockCant },
                historial_cambios: [{
                  fecha: fechaActualISO,
                  usuario_nombre: userAuth?.nombre || 'Usuario ATOM',
                  usuario_id: userAuth?.id_usuario || '',
                  usuario_rol: userAuth?.rol || 'ADMIN',
                  motivo: `Carga Masiva via CSV (Creación Inicial)`
                }]
              };
            }

            batchArray[batchIndex].set(docRef, finalObj, { merge: true });
            operacionCount++;

            if (operacionCount === 490) {
              batchArray.push(writeBatch(db));
              batchIndex++;
              operacionCount = 0;
            }
          }
        }

        for (const batch of batchArray) await batch.commit();

        alert(`¡Procesamiento Masivo Exitoso!\n\n✨ Nuevos Registrados: ${nuevosCreados}\n🔄 Actualizados a última versión: ${actualizados}`);
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

  const sedesFormulario = obtenerSedesAutorizadasUsuario();
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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Nuevo Producto</span>
          </button>
        </div>
      </div>

      {/* METRICAS SUPERIORES (KPIs ESTABLES) */}
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
              {formatoCOP(kpis.valorTotalInventario)}
            </div>
          </div>

          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            Valoración final con impuestos incluidos
          </p>
        </div>

        <div className={`bg-[#253443] border rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[9.5rem] space-y-3 transition-colors ${
          kpis.totalBajoStockCount > 0 ? 'border-amber-500/50' : 'border-slate-700/50'
        }`}>
          <div className="flex justify-between items-start">
            <span className={`text-[11px] font-satoshi-black uppercase tracking-wider ${
              kpis.totalBajoStockCount > 0 ? 'text-amber-400' : 'text-[#A0AEC0]'
            }`}>
              REQUIEREN REPOSICIÓN
            </span>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              kpis.totalBajoStockCount > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-[#1D2935] text-slate-500'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>

          <div>
            <div className={`text-4xl font-black font-satoshi-black leading-tight ${
              kpis.totalBajoStockCount > 0 ? 'text-amber-300' : 'text-slate-300'
            }`}>
              {kpis.totalBajoStockCount} <span className="text-sm font-satoshi-regular text-[#A0AEC0]">SKUs</span>
            </div>
          </div>

          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            Productos con 5 o menos unidades
          </p>
        </div>

        <div className={`bg-[#253443] border rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[9.5rem] space-y-3 transition-colors ${
          kpis.totalInactivos120Count > 0 ? 'border-red-500/50' : 'border-slate-700/50'
        }`}>
          <div className="flex justify-between items-start">
            <span className={`text-[11px] font-satoshi-black uppercase tracking-wider ${
              kpis.totalInactivos120Count > 0 ? 'text-red-400' : 'text-[#A0AEC0]'
            }`}>
              ESTANCADOS (120+ DÍAS)
            </span>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              kpis.totalInactivos120Count > 0 ? 'bg-red-500/10 text-red-400' : 'bg-[#1D2935] text-slate-500'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          <div>
            <div className={`text-4xl font-black font-satoshi-black leading-tight ${
              kpis.totalInactivos120Count > 0 ? 'text-red-400' : 'text-slate-300'
            }`}>
              {kpis.totalInactivos120Count} <span className="text-sm font-satoshi-regular text-[#A0AEC0]">SKUs</span>
            </div>
          </div>

          <p className="text-xs text-[#A0AEC0] font-satoshi-regular truncate">
            Tienen stock pero 0 ventas en 4 meses
          </p>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-4 mb-8 space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto flex-1">
            <div className="relative flex-1 max-w-md">
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
            <span className="flex items-center gap-1.5">
              <span>Todos</span>
              <span className="bg-black/20 px-1.5 py-0.5 rounded-md text-[10px]">{countsFiltros.todos}</span>
            </span>
          </button>

          <button
            onClick={() => setFiltroStockRotacion('BAJO_STOCK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black transition ${
              filtroStockRotacion === 'BAJO_STOCK'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span>Bajo Stock (≤ 5)</span>
              <span className="bg-black/20 px-1.5 py-0.5 rounded-md text-[10px]">{countsFiltros.bajo}</span>
            </span>
          </button>

          <button
            onClick={() => setFiltroStockRotacion('INTERMEDIO')}
            className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black transition ${
              filtroStockRotacion === 'INTERMEDIO'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span>Stock Intermedio (6 - 20)</span>
              <span className="bg-black/20 px-1.5 py-0.5 rounded-md text-[10px]">{countsFiltros.inter}</span>
            </span>
          </button>

          <button
            onClick={() => setFiltroStockRotacion('INACTIVO_60')}
            className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black transition ${
              filtroStockRotacion === 'INACTIVO_60'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span>Estancado 60+ Días</span>
              <span className="bg-black/20 px-1.5 py-0.5 rounded-md text-[10px]">{countsFiltros.ina60}</span>
            </span>
          </button>

          <button
            onClick={() => setFiltroStockRotacion('INACTIVO_90')}
            className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black transition ${
              filtroStockRotacion === 'INACTIVO_90'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span>Estancado 90+ Días</span>
              <span className="bg-black/20 px-1.5 py-0.5 rounded-md text-[10px]">{countsFiltros.ina90}</span>
            </span>
          </button>

          <button
            onClick={() => setFiltroStockRotacion('INACTIVO_120')}
            className={`px-3 py-1.5 rounded-xl text-xs font-satoshi-black transition ${
              filtroStockRotacion === 'INACTIVO_120'
                ? 'bg-[#0DE8C0] text-[#1D2935]'
                : 'bg-[#1D2935] text-[#A0AEC0] hover:text-white border border-slate-700/60'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span>Estancado 120+ Días</span>
              <span className="bg-black/20 px-1.5 py-0.5 rounded-md text-[10px]">{countsFiltros.ina120}</span>
            </span>
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
                        {p.categoria || 'SIN CATEGORIA'}
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
                        Cat: {p.categoria || 'SIN CATEGORIA'}
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

      {/* MODAL CREAR / EDITAR PRODUCTO */}
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
                  className={`flex-1 py-1.5 rounded-lg text-xs font-satoshi-black transition flex items-center justify-center gap-1.5 ${
                    activeModalTab === 'DATOS'
                      ? 'bg-[#0DE8C0] text-[#1D2935]'
                      : 'text-[#A0AEC0] hover:text-white'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>Formulario de Edición</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalTab('HISTORIAL')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-satoshi-black transition flex items-center justify-center gap-1.5 ${
                    activeModalTab === 'HISTORIAL'
                      ? 'bg-[#0DE8C0] text-[#1D2935]'
                      : 'text-[#A0AEC0] hover:text-white'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Bitácora de Cambios ({historialCambios.length})</span>
                </button>
              </div>
            )}

            {/* FORMULARIO DE DATOS */}
            {activeModalTab === 'DATOS' && (
              <form onSubmit={handleSave} className="space-y-4">
                
                {/* SUBIDA DE IMAGEN */}
                <div className="bg-[#1D2935] border border-slate-700/80 rounded-xl p-4 space-y-3">
                  <label className="text-xs font-satoshi-black text-[#0DE8C0] uppercase flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Imagen del Producto</span>
                  </label>

                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl bg-[#253443] border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                      {imagenUrl ? (
                        <img src={imagenUrl} alt="Vista Previa" className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
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

                {/* SELECTOR DE CATEGORÍA PREDEFINIDA */}
                <div>
                  <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1.5">Categoría *</label>
                  <select
                    className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white font-satoshi-black focus:outline-none cursor-pointer"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                  >
                    {CATEGORIAS_OFICIALES.map(cat => (
                      <option key={cat} value={cat} className="bg-[#1D2935] text-white">
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ASIGNACIÓN DE INVENTARIO */}
                <div className="bg-[#1D2935] border border-slate-700 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-satoshi-black text-[#0DE8C0] uppercase flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <span>Asignación de Stock por Sede</span>
                    </label>
                    <span className="text-[10px] text-[#A0AEC0] font-mono">
                      Subtotal: {sedesFormulario.reduce((acc, s) => acc + Number(stockMap[s.id_sucursal] || 0), 0)} unds
                    </span>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {sedesFormulario.map((suc, i) => (
                      <div key={suc.id_sucursal || i} className="bg-[#253443] border border-slate-700/80 p-2.5 rounded-lg flex items-center justify-between gap-3 text-xs">
                        <span className="font-satoshi-black text-white truncate flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-[#0DE8C0] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          <span>{suc.nombre || suc.NOMBRE || `Sede ${suc.id_sucursal}`}</span>
                        </span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <input 
                            type="number"
                            min="0"
                            className="w-24 bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-1.5 text-center font-mono text-white text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                  <label className="text-xs font-satoshi-black text-[#0DE8C0] uppercase flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <span>Estructura de Precios Finales (Cliente)</span>
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-satoshi-black text-[#0DE8C0] mb-1 uppercase">Por Mayor ($)</label>
                      <input 
                        type="number"
                        className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="85000"
                        value={pmayor}
                        onChange={(e) => setPmayor(e.target.value ? Number(e.target.value) : '')}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-satoshi-black text-white mb-1 uppercase">Tienda POS ($)</label>
                      <input 
                        type="number"
                        className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="129000"
                        value={plocal}
                        onChange={(e) => setPlocal(e.target.value ? Number(e.target.value) : '')}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-satoshi-black text-[#6884C5] mb-1 uppercase">E-Commerce ($)</label>
                      <input 
                        type="number"
                        className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="119000"
                        value={pecom}
                        onChange={(e) => setPecom(e.target.value ? Number(e.target.value) : '')}
                      />
                    </div>
                  </div>
                </div>

                {/* UNIT ECONOMICS */}
                <div className="bg-[#1D2935] border border-slate-700 p-4 rounded-xl space-y-3">
                  <label className="text-xs font-satoshi-black text-[#0DE8C0] uppercase flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Unit Economics (Costos Unitarios)</span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-satoshi-black text-[#A0AEC0] mb-1 uppercase">
                        Costo Fabricación / Compra ($)
                      </label>
                      <input 
                        type="number"
                        min="0"
                        className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                        className="w-full bg-[#253443] border border-slate-700 focus:border-[#0DE8C0] rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                    <label className="text-xs font-satoshi-black text-[#0DE8C0] uppercase flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-[#0DE8C0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span>Impuesto al Valor Agregado (IVA)</span>
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
                      <svg className="w-4 h-4 text-[#C81FDA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Motivo / Justificación de la Edición *</span>
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
                        <span className="font-satoshi-black text-[#0DE8C0] flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span>{cambio.usuario_nombre || 'Usuario'}</span>
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

      {/* MODAL CARGA MASIVA DE PRODUCTOS */}
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
                  {loadingMasivo ? 'Importando...' : ' Procesar e Indexar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
