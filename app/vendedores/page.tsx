'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
// 🛡️ IMPORTACIONES NUEVAS PARA FIREBASE AUTH Y LA APP SECUNDARIA
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import app, { db } from '@/lib/firebase';

export default function VendedoresPage() {
  const [userAuth, setUserAuth] = useState<any>(null);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal Crear / Editar Usuario
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Campos Formulario
  const [nombre, setNombre] = useState('');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [rol, setRol] = useState<'ADMIN' | 'GERENTE_BODEGA' | 'VENDEDOR' | 'CONTABLE'>('VENDEDOR');
  
  // ASIGNACIÓN DE MÚLTIPLES SEDES
  const [sedesAsignadas, setSedesAsignadas] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('atom_user_session');
    if (savedUser) {
      setUserAuth(JSON.parse(savedUser));
    }
  }, []);

  // Escuchar Firestore en Tiempo Real
  useEffect(() => {
    if (!userAuth || !userAuth.id_cuenta) return;

    const qUsers = query(collection(db, 'usuarios'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubUsers = onSnapshot(qUsers, 
      (snap) => setUsuarios(snap.docs.map(d => ({ ...d.data(), id_doc: d.id }))),
      (err) => console.error("Error cargando usuarios:", err)
    );

    const qSuc = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubSuc = onSnapshot(qSuc, 
      (snap) => setSucursales(snap.docs.map(d => ({ ...d.data(), id_doc: d.id }))),
      (err) => console.error("Error cargando sucursales:", err)
    );

    return () => {
      unsubUsers();
      unsubSuc();
    };
  }, [userAuth]);

  // ==========================================
  // FUNCIONES DE INTERFAZ Y FORMULARIO
  // ==========================================
  const handleToggleSede = (idSucursal: string) => {
    setSedesAsignadas(prev => {
      if (prev.includes(idSucursal)) {
        return prev.filter(id => id !== idSucursal);
      } else {
        return [...prev, idSucursal];
      }
    });
  };

  const handleSelectTodasSedes = () => {
    const todasIds = sucursales.map(s => s.id_sucursal).filter(Boolean);
    if (sedesAsignadas.length === todasIds.length) {
      setSedesAsignadas([]);
    } else {
      setSedesAsignadas(todasIds);
    }
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setNombre('');
    setUser('');
    setPass('');
    setRol('VENDEDOR');
    
    // Preseleccionar la primera sede si existe
    if (sucursales.length > 0 && sucursales[0].id_sucursal) {
      setSedesAsignadas([sucursales[0].id_sucursal]);
    } else {
      setSedesAsignadas([]);
    }

    setShowModal(true);
  };

  const handleOpenEdit = (u: any) => {
    setEditingId(u.id_doc || u.id_usuario);
    setNombre(u.nombre || '');
    setUser(u.user || '');
    setPass(''); // Limpiamos el campo por seguridad
    setRol(u.rol || 'VENDEDOR');

    // Cargar arreglo de sedes asignadas
    if (Array.isArray(u.sedes_asignadas) && u.sedes_asignadas.length > 0) {
      setSedesAsignadas(u.sedes_asignadas);
    } else if (u.id_sucursal) {
      setSedesAsignadas([u.id_sucursal]);
    } else {
      setSedesAsignadas([]);
    }

    setShowModal(true);
  };

  // ==========================================
  // 🛡️ CRUD CON FIREBASE AUTH SECUNDARIO
  // ==========================================
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones
    if (!nombre.trim() || !user.trim()) {
      return alert('Por favor ingresa Nombre y Usuario/Correo.');
    }
    if (!user.includes('@')) {
      return alert('Firebase Auth requiere que el usuario sea un correo válido (ej: cajero@empresa.com).');
    }
    if (!editingId && !pass.trim()) {
      return alert('La contraseña es obligatoria para crear un usuario nuevo.');
    }
    if (!editingId && pass.length < 6) {
      return alert('La contraseña debe tener al menos 6 caracteres.');
    }
    if (sedesAsignadas.length === 0) {
      return alert('Debes seleccionar al menos una sede asignada para el usuario.');
    }

    setLoading(true);
    try {
      const userClean = user.trim().toLowerCase();
      let uidFinal = editingId;

      // 1. SI ES UN USUARIO NUEVO, CREARLO EN FIREBASE AUTH
      if (!editingId) {
        // Inicializar o recuperar la App Secundaria para no cerrar la sesión del Admin
        const apps = getApps();
        let secondaryApp = apps.find(a => a.name === 'SecondaryApp');
        if (!secondaryApp) {
          secondaryApp = initializeApp(app.options, 'SecondaryApp');
        }
        const secondaryAuth = getAuth(secondaryApp);

        // Crear usuario en la bóveda
        const cred = await createUserWithEmailAndPassword(secondaryAuth, userClean, pass.trim());
        uidFinal = cred.user.uid;

        // Deslogueamos la app secundaria inmediatamente
        await signOut(secondaryAuth);
      }

      // 2. GUARDAR DATOS PÚBLICOS EN FIRESTORE (SIN LA CONTRASEÑA)
      const userData = {
        id_cuenta: userAuth.id_cuenta,
        id_usuario: uidFinal,
        nombre: nombre.trim(),
        user: userClean,
        email: userClean,
        rol: rol,
        id_sucursal: sedesAsignadas[0] || '', // Por compatibilidad
        sedes_asignadas: sedesAsignadas,
        fecha_actualizacion: new Date().toISOString()
      };

      await setDoc(doc(db, 'usuarios', uidFinal as string), userData, { merge: true });
      setShowModal(false);
      alert(editingId ? '¡Usuario y sedes actualizados con éxito!' : '¡Usuario creado exitosamente de forma segura!');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        alert('Este correo ya está registrado en Firebase Auth. Utiliza otro.');
      } else {
        alert('Error al guardar el usuario: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (u: any) => {
    if (!confirm(`¿Estás seguro de eliminar el acceso para ${u.nombre}? (Nota: Su cuenta en Auth seguirá existiendo pero no podrá ingresar al sistema).`)) return;

    try {
      const docId = u.id_doc || u.id_usuario;
      await deleteDoc(doc(db, 'usuarios', docId));
      alert('Usuario eliminado correctamente.');
    } catch (err: any) {
      console.error(err);
      alert('Error al eliminar usuario: ' + err.message);
    }
  };

  // ==========================================
  // 🧠 RENDIMIENTO: CÁLCULOS MEMOIZADOS
  // ==========================================
  const { usuariosFiltrados, totalEquipoCount, vendedoresCount, gerentesCount } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    
    // Filtro de búsqueda (Excluyendo ADMIN)
    const filtrados = usuarios.filter(u => {
      if (u.rol === 'ADMIN') return false;
      return String(u.nombre || '').toLowerCase().includes(q) ||
             String(u.user || u.email || '').toLowerCase().includes(q) ||
             String(u.rol || '').toLowerCase().includes(q);
    });

    // Contadores Generales
    const equipo = usuarios.filter(u => u.rol !== 'ADMIN');
    return {
      usuariosFiltrados: filtrados,
      totalEquipoCount: equipo.length,
      vendedoresCount: equipo.filter(u => u.rol === 'VENDEDOR').length,
      gerentesCount: equipo.filter(u => u.rol === 'GERENTE_BODEGA').length,
    };
  }, [usuarios, searchQuery]);

  // ==========================================
  // RENDERIZADO UI (DISEÑO LOBO STOCK)
  // ==========================================
  return (
    <div className="min-h-screen bg-[#F4F5F7] text-gray-800 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-200 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD800] border border-gray-800 animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-gray-900 uppercase tracking-wider font-bold">
              Control de Accesos & Permisos Multisede
            </span>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight font-satoshi-black">
            EQUIPO / VENDEDORES
          </h1>
          <p className="text-xs text-gray-500 mt-1 font-satoshi-regular max-w-xl">
            Asigna roles de Gerente, Vendedor o Contable y otorga permisos de gestión en múltiples sedes.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-satoshi-black px-6 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-sm flex items-center gap-2 shrink-0 font-bold"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Añadir Miembro al Equipo</span>
        </button>
      </div>

      {/* METRICAS SUPERIORES CON ÍCONOS SVG 2D */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* EQUIPO REGISTRADO */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[9.5rem] space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider font-bold">
              EQUIPO REGISTRADO
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#222222] text-[#FFD800] flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div>
            <span className={`text-4xl font-black font-satoshi-black tracking-tight ${totalEquipoCount > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
              {totalEquipoCount}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-satoshi-regular leading-tight">
            Colaboradores con acceso activo a las sedes
          </p>
        </div>

        {/* VENDEDORES POS */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[9.5rem] space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider font-bold">
              CAJEROS / VENDEDORES
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#222222] text-[#FFD800] flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
            </div>
          </div>
          <div>
            <span className={`text-4xl font-black font-satoshi-black tracking-tight ${vendedoresCount > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
              {vendedoresCount}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-satoshi-regular leading-tight">
            Asignados a cobro POS y atención comercial
          </p>
        </div>

        {/* GERENTES DE BODEGA */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between min-h-[9.5rem] space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-gray-700 uppercase tracking-wider font-bold">
              GERENTES DE BODEGA
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#222222] text-[#FFD800] flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
          <div>
            <span className={`text-4xl font-black font-satoshi-black tracking-tight ${gerentesCount > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
              {gerentesCount}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-satoshi-regular leading-tight">
            Encargados de control de stock e inventario
          </p>
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-8 flex items-center justify-between gap-4 shadow-sm">
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl pl-10 pr-3 py-2.5 text-xs text-gray-900 placeholder-gray-500 focus:outline-none font-satoshi-regular transition"
            placeholder="Buscar por Nombre, Usuario o Rol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* TABLA DE USUARIOS DEL EQUIPO */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-[11px] font-satoshi-black text-gray-600 uppercase tracking-wider border-b border-gray-200">
              <th className="p-4 rounded-tl-2xl">Miembro / Usuario</th>
              <th className="p-4">Rol Asignado</th>
              <th className="p-4">Sedes Asignadas</th>
              <th className="p-4 text-center rounded-tr-2xl">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-xs font-satoshi-regular text-gray-800">
            {usuariosFiltrados.map((u, idx) => {
              const sedesUser = Array.isArray(u.sedes_asignadas) && u.sedes_asignadas.length > 0 
                ? u.sedes_asignadas 
                : (u.id_sucursal ? [u.id_sucursal] : []);

              const sedesNombres = sucursales
                .filter(s => sedesUser.includes(s.id_sucursal))
                .map(s => s.nombre || s.NOMBRE);

              return (
                <tr key={u.id_doc || idx} className="hover:bg-gray-50/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#222222] text-[#FFD800] font-satoshi-black text-xs flex items-center justify-center">
                        {u.nombre ? u.nombre.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div className="font-satoshi-black text-gray-900 text-sm">{u.nombre}</div>
                        <div className="font-mono text-xs text-gray-500">{u.user || u.email}</div>
                      </div>
                    </div>
                  </td>

                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-satoshi-black ${
                      u.rol === 'GERENTE_BODEGA' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 
                      u.rol === 'CONTABLE' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                      'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}>
                      {u.rol === 'GERENTE_BODEGA' ? 'GERENTE DE BODEGA' : 
                       u.rol === 'CONTABLE' ? 'ÁREA CONTABLE' : 'VENDEDOR POS'}
                    </span>
                  </td>

                  <td className="p-4">
                    <div className="flex flex-wrap gap-1.5">
                      {sedesNombres.map((nomSede, i) => (
                        <span key={i} className="bg-white text-gray-700 border border-gray-300 text-[10px] px-2 py-0.5 rounded-md font-satoshi-regular flex items-center gap-1">
                          <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {nomSede}
                        </span>
                      ))}

                      {sedesNombres.length === 0 && (
                        <span className="text-gray-400 italic text-[11px]">Sin sede asignada</span>
                      )}
                    </div>
                  </td>

                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(u)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-900 border border-gray-300 font-satoshi-black px-3 py-1.5 rounded-lg text-xs transition"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(u)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Eliminar usuario"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {usuariosFiltrados.length === 0 && (
              <tr>
                <td colSpan={4} className="p-12 text-center text-gray-500 text-xs font-satoshi-regular">
                  No hay miembros adicionales en el equipo. Presiona &quot;Añadir Miembro al Equipo&quot; para registrar cajeros o gerentes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL CREAR / EDITAR USUARIO DEL EQUIPO */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl font-sans space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-lg font-satoshi-black text-gray-900 uppercase">
                {editingId ? 'Editar Usuario' : 'Añadir Miembro al Equipo'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-3 text-xs text-gray-900 focus:outline-none transition-all"
                  placeholder="Ej: Carlos Andrés Pérez"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                  Usuario / Correo de Acceso *
                </label>
                <input
                  type="email"
                  className={`w-full border rounded-xl p-3 text-xs focus:outline-none font-mono transition-all ${
                    editingId 
                      ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' 
                      : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20'
                  }`}
                  placeholder="cajero@lobostock.com"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  disabled={!!editingId}
                  required
                />
                {editingId && <span className="text-[10px] text-gray-400 mt-1 block">El correo no se puede modificar por seguridad.</span>}
              </div>

              {/* 🛡️ SOLO MOSTRAMOS LA CONTRASEÑA SI ESTAMOS CREANDO UN USUARIO NUEVO */}
              {!editingId && (
                <div>
                  <label className="block text-xs font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                    Contraseña *
                  </label>
                  <input
                    type="password"
                    className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 rounded-xl p-3 text-xs text-gray-900 focus:outline-none font-mono transition-all"
                    placeholder="••••••••••••"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    required={!editingId}
                  />
                  <span className="text-[10px] text-gray-400 mt-1 block">Debe tener al menos 6 caracteres.</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-satoshi-black text-gray-700 uppercase tracking-wider mb-1">
                  Rol y Nivel de Permisos
                </label>
                <select
                  className="w-full bg-gray-50 border border-gray-300 focus:border-[#FFD800] focus:ring-2 focus:ring-[#FFD800]/20 text-xs text-gray-900 font-satoshi-black rounded-xl p-3 focus:outline-none cursor-pointer transition-all"
                  value={rol}
                  onChange={(e: any) => setRol(e.target.value)}
                >
                  <option value="VENDEDOR">🛒 Vendedor / Cajero POS (Caja Local)</option>
                  <option value="GERENTE_BODEGA">📦 Gerente de Bodega (Inventario)</option>
                  <option value="CONTABLE">📊 Área Contable (Facturación y Reportes)</option>
                </select>
              </div>

              {/* SECCIÓN DE SELECCIÓN DE MÚLTIPLES SEDES */}
              <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-satoshi-black text-gray-900 uppercase">
                    📍 Asignación de Sedes ({sedesAsignadas.length})
                  </label>
                  
                  <button
                    type="button"
                    onClick={handleSelectTodasSedes}
                    className="text-[10px] text-gray-600 hover:text-gray-900 hover:underline font-satoshi-black"
                  >
                    {sedesAsignadas.length === sucursales.length ? 'Desmarcar Todas' : 'Seleccionar Todas'}
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {sucursales.filter(s => s.estado !== 'INACTIVA').map((suc, i) => {
                    const isChecked = sedesAsignadas.includes(suc.id_sucursal);

                    return (
                      <div
                        key={suc.id_sucursal || i}
                        onClick={() => handleToggleSede(suc.id_sucursal)}
                        className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition text-xs ${
                          isChecked 
                            ? 'bg-[#FFD800]/10 border-[#FFD800] text-gray-900 font-satoshi-black'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-4 h-4 accent-[#222222] cursor-pointer"
                          />
                          <span className="truncate">{suc.nombre || suc.NOMBRE}</span>
                        </div>

                        <span className="text-[10px] font-mono text-gray-400">
                          ID: {suc.id_sucursal}
                        </span>
                      </div>
                    );
                  })}

                  {sucursales.length === 0 && (
                    <p className="text-[11px] text-gray-500 italic">No hay sedes registradas para asignar.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 font-satoshi-black py-3 rounded-xl text-xs uppercase hover:bg-gray-200 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-[#FFD800] hover:bg-[#FDCB13] text-[#222222] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-sm transition disabled:opacity-50"
                >
                  {loading ? 'Guardando...' : (editingId ? 'Guardar Cambios' : 'Crear Usuario')}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
