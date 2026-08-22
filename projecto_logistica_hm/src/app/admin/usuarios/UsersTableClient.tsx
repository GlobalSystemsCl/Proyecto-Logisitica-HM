'use client';

import { useState, useTransition } from 'react';
import { UserProfile, UserRole } from '@/types/auth.types';
import { createUserAction, toggleUserStatusAction, resetUserPasswordAction } from '@/app/actions/users.actions';
import {
  Users,
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  Mail,
  Key,
  Power,
  X,
  AlertCircle,
  Copy,
  Check,
  ShieldAlert,
  Lock,
} from 'lucide-react';

interface Props {
  users: UserProfile[];
  currentAdminEmail: string;
  currentAdminId: string;
}

const roleLabels: Record<UserRole, { label: string; color: string }> = {
  administrador: {
    label: 'Administrador',
    color: 'bg-purple-950/80 text-purple-300 border-purple-800/60',
  },
  jefe_local: {
    label: 'Jefe de Local',
    color: 'bg-blue-950/80 text-blue-300 border-blue-800/60',
  },
  ejecutivo: {
    label: 'Ejecutivo',
    color: 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60',
  },
  logistica: {
    label: 'Logística',
    color: 'bg-amber-950/80 text-amber-300 border-amber-800/60',
  },
};

export default function UsersTableClient({ users, currentAdminEmail, currentAdminId }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    email?: string;
    tempPassword?: string;
  } | null>(null);
  const [copiedCreds, setCopiedCreds] = useState(false);

  // Form states for Create User modal
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [emailPrefix, setEmailPrefix] = useState('');
  const [emailDomain, setEmailDomain] = useState('gmail.com');
  const [customPassword, setCustomPassword] = useState('');
  const [rol, setRol] = useState<UserRole>('ejecutivo');
  const [isSubmitting, startTransition] = useTransition();

  // Filter users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.apellido.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = selectedRole === 'todos' || u.rol === selectedRole;
    return matchesSearch && matchesRole;
  });

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.activo).length;
  const inactiveUsers = totalUsers - activeUsers;

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    setCopiedCreds(false);

    let fullEmail = emailPrefix.trim();
    if (!fullEmail.includes('@')) {
      fullEmail = `${emailPrefix.trim()}@${emailDomain.trim()}`;
    }

    startTransition(async () => {
      const res = await createUserAction({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: fullEmail,
        rol,
        password: customPassword.trim() || undefined,
      });

      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || 'Usuario creado con éxito.',
          email: res.email,
          tempPassword: res.tempPassword,
        });
        setIsModalOpen(false);
        setNombre('');
        setApellido('');
        setEmailPrefix('');
        setCustomPassword('');
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Error al crear usuario.',
        });
      }
    });
  };

  const handleToggleStatus = (userId: string, currentStatus: boolean, email: string) => {
    if (email.toLowerCase() === 'maic.hernandez.dev@gmail.com' && currentStatus) {
      alert('La cuenta del Administrador Principal no puede ser desactivada.');
      return;
    }
    if (userId === currentAdminId && currentStatus) {
      alert('No puedes desactivar tu propia cuenta de administrador.');
      return;
    }

    const actionText = currentStatus ? 'desactivar' : 'activar';
    if (!confirm(`¿Estás seguro de que deseas ${actionText} a ${email}?`)) {
      return;
    }

    startTransition(async () => {
      const res = await toggleUserStatusAction(userId, !currentStatus);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Estado del usuario actualizado a ${!currentStatus ? 'Activo' : 'Inactivo'}.`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'No se pudo actualizar el estado.',
        });
      }
    });
  };

  const handleResetPassword = (userId: string, email: string) => {
    if (!confirm(`¿Deseas generar una nueva contraseña provisoria para ${email}?`)) {
      return;
    }

    setCopiedCreds(false);
    startTransition(async () => {
      const res = await resetUserPasswordAction(userId, email);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Nueva contraseña generada para ${email}.`,
          email: res.email,
          tempPassword: res.tempPassword,
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Error al resetear contraseña.',
        });
      }
    });
  };

  const handleCopyCredentials = (email: string, pass: string) => {
    const text = `Credenciales H.Motores:\nCorreo: ${email}\nContraseña Provisoria: ${pass}\nEnlace de Ingreso: ${window.location.origin}/login\n(El sistema te pedirá establecer tu contraseña propia al ingresar)`;
    navigator.clipboard.writeText(text);
    setCopiedCreds(true);
    setTimeout(() => setCopiedCreds(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-blue-400" />
            <span>Gestión de Cuentas y Usuarios</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Administra los accesos internos, roles y activación del personal de H.Motores
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Registrar Nuevo Usuario</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-950/80 border border-blue-800/50 flex items-center justify-center text-blue-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Usuarios</p>
            <p className="text-2xl font-bold text-white">{totalUsers}</p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-950/80 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Activos</p>
            <p className="text-2xl font-bold text-emerald-400">{activeUsers}</p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-950/80 border border-rose-800/50 flex items-center justify-center text-rose-400">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Inactivos / Bloqueados</p>
            <p className="text-2xl font-bold text-rose-400">{inactiveUsers}</p>
          </div>
        </div>
      </div>

      {/* Feedback banner with Credential Display */}
      {feedback && (
        <div
          className={`p-5 rounded-2xl border transition-all ${
            feedback.type === 'success'
              ? 'bg-slate-900/90 border-emerald-700/70 text-emerald-200'
              : 'bg-rose-950/60 border-rose-800 text-rose-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-2">
                <p className="font-bold text-base text-white">{feedback.message}</p>

                {feedback.tempPassword && feedback.email && (
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2 mt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                      <div>
                        <span className="text-slate-400 block uppercase text-[10px]">Correo:</span>
                        <span className="text-white font-semibold text-sm">{feedback.email}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block uppercase text-[10px]">Contraseña Provisoria:</span>
                        <span className="text-amber-400 font-bold text-base tracking-wider">{feedback.tempPassword}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 pt-1 font-sans border-t border-slate-800">
                      💡 El usuario iniciará sesión en <strong>/login</strong> con esta contraseña provisoria y el sistema le solicitará de forma obligatoria establecer su propia contraseña permanente.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {feedback.tempPassword && feedback.email && (
                <button
                  onClick={() => handleCopyCredentials(feedback.email!, feedback.tempPassword!)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-emerald-600/30 transition-all cursor-pointer shrink-0"
                >
                  {copiedCreds ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copiar Credenciales</span>
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => setFeedback(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nombre o correo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Rol:
          </label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos los roles</option>
            <option value="administrador">Administrador</option>
            <option value="jefe_local">Jefe de Local</option>
            <option value="ejecutivo">Ejecutivo</option>
            <option value="logistica">Logística</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-xs uppercase font-semibold text-slate-400 tracking-wider">
                <th className="py-3.5 px-4">Usuario</th>
                <th className="py-3.5 px-4">Correo</th>
                <th className="py-3.5 px-4">Rol</th>
                <th className="py-3.5 px-4">Estado</th>
                <th className="py-3.5 px-4">Clave Inicial</th>
                <th className="py-3.5 px-4">Registro</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No se encontraron usuarios que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const roleConfig = roleLabels[user.rol] || {
                    label: user.rol,
                    color: 'bg-slate-800 text-slate-300 border-slate-700',
                  };
                  const isMainAdmin = user.email.toLowerCase() === 'maic.hernandez.dev@gmail.com';

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-800/30 transition-colors"
                    >
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-xs text-white uppercase shadow-sm">
                            {user.nombre.charAt(0)}
                            {user.apellido ? user.apellido.charAt(0) : ''}
                          </div>
                          <div>
                            <p className="font-semibold text-white">
                              {user.nombre} {user.apellido}
                            </p>
                            {isMainAdmin && (
                              <span className="text-[10px] text-amber-400 font-medium">
                                Administrador Principal
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-4 text-slate-300 font-mono text-xs">
                        {user.email}
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${roleConfig.color}`}
                        >
                          {roleConfig.label}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {user.activo ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-950/80 text-rose-300 border border-rose-800/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Inactivo
                          </span>
                        )}
                      </td>

                      {/* Password setup status */}
                      <td className="py-3.5 px-4">
                        {user.requiere_cambio_clave ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/60 text-amber-300 border border-amber-800/50">
                            <ShieldAlert className="w-3 h-3" />
                            <span>Pendiente cambio</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400">
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Definida</span>
                          </span>
                        )}
                      </td>

                      {/* Registration Date */}
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {new Date(user.created_at).toLocaleDateString('es-CL')}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {/* Reset password button */}
                        <button
                          onClick={() => handleResetPassword(user.id, user.email)}
                          title="Generar nueva contraseña provisoria"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Key className="w-4 h-4" />
                        </button>

                        {/* Toggle active/inactive */}
                        <button
                          onClick={() => handleToggleStatus(user.id, user.activo, user.email)}
                          disabled={isMainAdmin}
                          title={user.activo ? 'Desactivar usuario' : 'Activar usuario'}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                            user.activo
                              ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40'
                              : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-950/40'
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Crear Nuevo Usuario */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-950/80 border border-blue-800/50 flex items-center justify-center text-blue-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Registrar Nuevo Usuario</h2>
                  <p className="text-xs text-slate-400">Creación de cuenta empresarial</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Carlos"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Apellido *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. González"
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Email with Domain Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Correo Electrónico *
                </label>
                <div className="flex rounded-xl overflow-hidden border border-slate-700 bg-slate-800 focus-within:ring-2 focus-within:ring-blue-500">
                  <input
                    type="text"
                    required
                    placeholder="nombre.apellido"
                    value={emailPrefix}
                    onChange={(e) => setEmailPrefix(e.target.value)}
                    className="flex-1 px-3 py-2 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                  />
                  <span className="px-2 py-2 text-slate-500 text-sm font-semibold flex items-center">
                    @
                  </span>
                  <select
                    value={emailDomain}
                    onChange={(e) => setEmailDomain(e.target.value)}
                    className="px-3 py-2 bg-slate-900/90 text-sm text-slate-200 border-l border-slate-700 focus:outline-none"
                  >
                    <option value="gmail.com">gmail.com (Pruebas)</option>
                    <option value="hmotores.cl">hmotores.cl (Corporativo)</option>
                  </select>
                </div>
              </div>

              {/* Rol */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Rol Asignado *
                </label>
                <select
                  value={rol}
                  onChange={(e) => setRol(e.target.value as UserRole)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ejecutivo">Ejecutivo (Gestión de solicitudes/vehículos)</option>
                  <option value="jefe_local">Jefe de Local (Aprobación, priorización, entrega)</option>
                  <option value="logistica">Logística (Coordinación de traslados)</option>
                  <option value="administrador">Administrador (Control total del sistema)</option>
                </select>
              </div>

              {/* Optional Custom Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Contraseña Provisoria (Opcional)</span>
                  <span className="text-[10px] text-slate-500 font-normal">Si se deja vacío, se auto-genera</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej. ClaveProvisoria123"
                  value={customPassword}
                  onChange={(e) => setCustomPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              {/* Explanatory note */}
              <div className="p-3 bg-blue-950/40 border border-blue-800/40 rounded-xl flex items-start gap-2.5 text-xs text-blue-300">
                <Lock className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                <span>
                  El usuario ingresará con su correo y contraseña provisoria a <strong>/login</strong>, y el sistema le solicitará automáticamente definir su propia contraseña permanente en su primer acceso.
                </span>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/30 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Creando...' : 'Crear Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
