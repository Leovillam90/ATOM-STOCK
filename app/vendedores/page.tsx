'use client';

import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
  const [rol, setRol] = useState<'ADMIN' | 'GERENTE_BODEGA' | 'VENDEDOR'>('VENDEDOR');
  
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
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      setUsuarios(snap.docs.map(d => ({ ...d.data(), id_doc: d.id })));
    });

    const qSuc = query(collection(db, 'sucursales'), where('id_cuenta', '==', userAuth.id_cuenta));
    const unsubSuc = onSnapshot(qSuc, (snap) => {
      setSucursales(snap.docs.map(d => ({ ...d.data(), id_doc: d.id })));
    });

    return () => {
      unsubUsers();
      unsubSuc();
    };
  }, [userAuth]);

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
    setPass(u.pass || u.PASS || '');
    setRol(u.rol || 'VENDEDOR');

    // Cargar arreglo de sedes asignadas o fallback si solo tenía una
    if (Array.isArray(u.sedes_asignadas) && u.sedes_asignadas.length > 0) {
      setSedesAsignadas(u.sedes_asignadas);
    } else if (u.id_sucursal) {
      setSedesAsignadas([u.id_sucursal]);
    } else {
      setSedesAsignadas([]);
    }

    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !user.trim() || !pass.trim()) {
      return alert('Por favor ingresa Nombre, Usuario/Correo y Contraseña.');
    }

    if (sedesAsignadas.length === 0) {
      return alert('Debes seleccionar al menos una sede asignada para el usuario.');
    }

    setLoading(true);
    try {
      const userClean = user.trim().toLowerCase();
      const docId = editingId || `USER_${Date.now().toString().slice(-6)}`;

      const userData = {
        id_cuenta: userAuth.id_cuenta,
        id_usuario: docId,
        nombre: nombre.trim(),
        user: userClean,
        pass: pass.trim(),
        rol: rol,
        id_sucursal: sedesAsignadas[0] || '', // Sede principal por defecto
        sedes_asignadas: sedesAsignadas,     // Arreglo con múltiples sedes
        fecha_actualizacion: new Date().toISOString()
      };

      await setDoc(doc(db, 'usuarios', docId), userData, { merge: true });
      setShowModal(false);
      alert(editingId ? '¡Usuario y sedes actualizados con éxito!' : '¡Usuario creado exitosamente!');
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar el usuario: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (u: any) => {
    if (!confirm(`¿Estás seguro de eliminar el acceso para ${u.nombre}?`)) return;

    try {
      const docId = u.id_doc || u.id_usuario;
      await deleteDoc(doc(db, 'usuarios', docId));
      alert('Usuario eliminado correctamente.');
    } catch (err: any) {
      console.error(err);
      alert('Error al eliminar usuario: ' + err.message);
    }
  };

  // Filtrado de Usuarios por Búsqueda
  const usuariosFiltrados = usuarios.filter(u => {
    const q = searchQuery.toLowerCase().trim();
    return String(u.nombre || '').toLowerCase().includes(q) ||
           String(u.user || '').toLowerCase().includes(q) ||
           String(u.rol || '').toLowerCase().includes(q);
  });

  // Conteo por roles para métricas
  const totalActivosCount = usuarios.length;
  const vendedoresCount = usuarios.filter(u => u.rol === 'VENDEDOR').length;
  const gerentesCount = usuarios.filter(u => u.rol === 'GERENTE_BODEGA').length;

  return (
    <div className="min-h-screen bg-[#1D2935] text-slate-100 p-6 md:p-10 font-sans relative pb-20">
      
      {/* CABECERA PRINCIPAL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-700/60 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#0DE8C0] animate-pulse"></span>
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              Control de Accesos & Permisos Multisede
            </span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight font-satoshi-black">
            Equipo / Vendedores
          </h1>
          <p className="text-xs text-[#A0AEC0] mt-1 font-satoshi-regular max-w-xl">
            Asigna roles de Administrador, Gerente o Vendedor y otorga permisos de gestión en múltiples sedes.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black px-6 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 shadow-lg shadow-emerald-950/40 flex items-center gap-2 shrink-0"
        >
          <svg className="w-4 h-4 text-[#1D2935]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          <span>Añadir Miembro al Equipo</span>
        </button>
      </div>

      {/* METRICAS SUPERIORES CON ALTURA FLEXIBLE Y JERARQUÍA CORREGIDA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[9.5rem] space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#0DE8C0] uppercase tracking-wider">
              TOTAL USUARIOS ACTIVOS
            </span>
            <div className="w-8 h-8 rounded-full bg-[#0DE8C0]/10 flex items-center justify-center text-[#0DE8C0] shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          <div>
            <span className={`text-4xl font-black font-satoshi-black tracking-tight ${totalActivosCount > 0 ? 'text-white drop-shadow-sm' : 'text-slate-500'}`}>
              {totalActivosCount}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular leading-tight">
            Cuentas con credenciales de acceso al ERP
          </p>
        </div>

        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[9.5rem] space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#6884C5] uppercase tracking-wider">
              CAJEROS / VENDEDORES
            </span>
            <div className="w-8 h-8 rounded-full bg-[#6884C5]/10 flex items-center justify-center text-[#6884C5] shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
            </div>
          </div>
          <div>
            <span className={`text-4xl font-black font-satoshi-black tracking-tight ${vendedoresCount > 0 ? 'text-white drop-shadow-sm' : 'text-slate-500'}`}>
              {vendedoresCount}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular leading-tight">
            Asignados a cobro POS y atención comercial
          </p>
        </div>

        <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-5 shadow-xl flex flex-col justify-between min-h-[9.5rem] space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-satoshi-black text-[#C81FDA] uppercase tracking-wider">
              GERENTES DE BODEGA
            </span>
            <div className="w-8 h-8 rounded-full bg-[#C81FDA]/10 flex items-center justify-center text-[#C81FDA] shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
          <div>
            <span className={`text-4xl font-black font-satoshi-black tracking-tight ${gerentesCount > 0 ? 'text-white drop-shadow-sm' : 'text-slate-500'}`}>
              {gerentesCount}
            </span>
          </div>
          <p className="text-xs text-[#A0AEC0] font-satoshi-regular leading-tight">
            Encargados de control de stock e inventario
          </p>
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl p-4 mb-8 flex items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input 
            type="text" 
            className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-[#A0AEC0] focus:outline-none font-satoshi-regular transition"
            placeholder="Buscar por Nombre, Usuario o Rol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* TABLA DE USUARIOS DEL EQUIPO CON LEGIBILIDAD AUMENTADA */}
      <div className="bg-[#253443] border border-slate-700/50 rounded-2xl shadow-xl overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#1D2935] text-[11px] font-satoshi-black text-[#A0AEC0] uppercase tracking-wider border-b border-slate-700">
              <th className="p-4">Miembro / Usuario</th>
              <th className="p-4">Rol Asignado</th>
              <th className="p-4">Sedes Asignadas</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60 text-xs font-satoshi-regular">
            {usuariosFiltrados.map((u, idx) => {
              const sedesUser = Array.isArray(u.sedes_asignadas) && u.sedes_asignadas.length > 0 
                ? u.sedes_asignadas 
                : (u.id_sucursal ? [u.id_sucursal] : []);

              const sedesNombres = sucursales
                .filter(s => sedesUser.includes(s.id_sucursal))
                .map(s => s.nombre || s.NOMBRE);

              return (
                <tr key={u.id_doc || idx} className="hover:bg-[#1D2935]/80 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#0DE8C0]/10 text-[#0DE8C0] font-satoshi-black text-xs flex items-center justify-center border border-[#0DE8C0]/20">
                        {u.nombre ? u.nombre.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div className="font-satoshi-black text-white text-sm">{u.nombre}</div>
                        {/* LUMINOSIDAD Y CONTRASTE MEJORADO EN EL CORREO/USUARIO */}
                        <div className="font-mono text-xs text-slate-300">{u.user}</div>
                      </div>
                    </div>
                  </td>

                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-satoshi-black ${
                      u.rol === 'ADMIN'
                        ? 'bg-purple-950/80 text-purple-300 border border-purple-800/40'
                        : (u.rol === 'GERENTE_BODEGA' ? 'bg-amber-950/80 text-amber-300 border border-amber-800/40' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/40')
                    }`}>
                      {u.rol === 'ADMIN' ? 'ADMINISTRADOR' : (u.rol === 'GERENTE_BODEGA' ? 'GERENTE DE BODEGA' : 'VENDEDOR POS')}
                    </span>
                  </td>

                  <td className="p-4">
                    <div className="flex flex-wrap gap-1.5">
                      {sedesNombres.map((nomSede, i) => (
                        <span key={i} className="bg-[#1D2935] text-slate-200 border border-slate-700 text-[10px] px-2 py-0.5 rounded-md font-satoshi-regular">
                          📍 {nomSede}
                        </span>
                      ))}

                      {sedesNombres.length === 0 && (
                        <span className="text-slate-500 italic text-[11px]">Sin sede asignada</span>
                      )}
                    </div>
                  </td>

                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(u)}
                        className="bg-[#1D2935] hover:bg-[#15202b] text-[#0DE8C0] border border-[#0DE8C0]/40 font-satoshi-black px-3 py-1.5 rounded-lg text-xs transition"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(u)}
                        className="p-1.5 text-red-400 hover:bg-red-950/40 rounded-lg transition"
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
                <td colSpan={4} className="p-12 text-center text-[#A0AEC0] text-xs font-satoshi-regular">
                  No se encontraron usuarios en la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL CREAR / EDITAR USUARIO CON SELECCIÓN DE MÚLTIPLES SEDES */}
      {showModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#253443] border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl font-sans space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-700/60 pb-3">
              <h3 className="text-lg font-satoshi-black text-white uppercase">
                {editingId ? 'Editar Usuario' : 'Añadir Miembro al Equipo'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none"
                  placeholder="Ej: Carlos Andrés Pérez"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1">
                  Usuario / Correo de Acceso *
                </label>
                <input
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-mono"
                  placeholder="carlos@atomstock.com"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1">
                  Contraseña *
                </label>
                <input
                  type="text"
                  className="w-full bg-[#1D2935] border border-slate-700 focus:border-[#0DE8C0] rounded-xl p-3 text-xs text-white focus:outline-none font-mono"
                  placeholder="••••••••••••"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-satoshi-black text-white uppercase tracking-wider mb-1">
                  Rol y Nivel de Permisos
                </label>
                <select
                  className="w-full bg-[#1D2935] border border-slate-700 text-xs text-[#0DE8C0] font-satoshi-black rounded-xl p-3 focus:outline-none cursor-pointer"
                  value={rol}
                  onChange={(e: any) => setRol(e.target.value)}
                >
                  <option value="VENDEDOR" className="bg-[#1D2935] text-white">🛒 Vendedor / Cajero POS (Caja Local)</option>
                  <option value="GERENTE_BODEGA" className="bg-[#1D2935] text-white">📦 Gerente de Bodega (Inventario & WMS)</option>
                  <option value="ADMIN" className="bg-[#1D2935] text-white">👑 Administrador General (Acceso Total)</option>
                </select>
              </div>

              {/* SECCIÓN DE SELECCIÓN DE MÚLTIPLES SEDES */}
              <div className="bg-[#1D2935] border border-slate-700 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-satoshi-black text-[#0DE8C0] uppercase">
                    📍 Asignación de Sedes ({sedesAsignadas.length})
                  </label>
                  
                  <button
                    type="button"
                    onClick={handleSelectTodasSedes}
                    className="text-[10px] text-[#0DE8C0] hover:underline font-satoshi-black"
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
                            ? 'bg-[#0DE8C0]/10 border-[#0DE8C0] text-white font-satoshi-black'
                            : 'bg-[#253443] border-slate-700/80 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-4 h-4 accent-[#0DE8C0] cursor-pointer"
                          />
                          <span className="truncate">{suc.nombre || suc.NOMBRE}</span>
                        </div>

                        <span className="text-[10px] font-mono text-slate-500">
                          ID: {suc.id_sucursal}
                        </span>
                      </div>
                    );
                  })}

                  {sucursales.length === 0 && (
                    <p className="text-[11px] text-[#A0AEC0] italic">No hay sedes registradas para asignar.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-[#1D2935] text-slate-300 font-satoshi-black py-3 rounded-xl text-xs uppercase hover:bg-slate-800 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-[#0DE8C0] hover:bg-[#0bcfa8] text-[#1D2935] font-satoshi-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg transition"
                >
                  {loading ? 'Guardando...' : (editingId ? 'Guardar Cambios' : 'Añadir Usuario')}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
