const GestorUsuarios = require("./gestor-usuarios");
require("dotenv").config();
const { fetch } = require("undici");

// --- Configuración de Odoo ---
const DB       = process.env.ODOO_DB;
const USERNAME = process.env.ODOO_USER;
const PASSWORD = process.env.ODOO_PASS;
const ODOO_URL = process.env.ODOO_URL;

// --- Helper JSON-RPC ---
async function jsonRpcCall(method, params) {
  const resp = await fetch(ODOO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: Math.floor(Math.random() * 100000),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`HTTP ${resp.status} ${resp.statusText} ${text}`);
  }

  const data = await resp.json();
  if (data.error) {
    throw new Error(data.error?.data?.message || data.error?.message || "Error en JSON-RPC");
  }
  return data.result;
}

class RutasAutenticacion {
  constructor(app, transportadorEmail) {
    this.app = app;
    this.transportadorEmail = transportadorEmail;
    this.gestorUsuarios = new GestorUsuarios();
    this.configurarRutas();
  }

  configurarRutas() {
    console.log("🔧 Configurando rutas de autenticación...");

    // ============================
    // Ruta para verificar usuario
    // ============================
    this.app.post("/api/auth/verificar-usuario", async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) {
          return res.status(400).json({ exito: false, mensaje: "Email requerido" });
        }

        const usuario = await this.gestorUsuarios.usuarioExiste(email);

        res.json({
          exito: true,
          existe: !!usuario,
          mensaje: usuario ? "Usuario encontrado" : "Usuario no encontrado",
        });
      } catch (error) {
        console.error("❌ Error verificando usuario:", error);
        res.status(500).json({ exito: false, mensaje: "Error interno del servidor" });
      }
    });

    // ============================
    // Ruta para iniciar sesión
    // ============================
    this.app.post("/api/auth/iniciar-sesion", async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) {
          return res.status(400).json({ exito: false, mensaje: "Email y contraseña requeridos" });
        }

        const usuarioExiste = await this.gestorUsuarios.usuarioExiste(email);
        if (!usuarioExiste) {
          return res.status(401).json({
            exito: false,
            mensaje: "Usuario no encontrado. ¿Necesitas registrarte?",
            necesitaRegistro: true,
          });
        }

        const usuario = await this.gestorUsuarios.validarUsuario(email, password);
        res.json({ exito: true, mensaje: "Inicio de sesión exitoso", usuario });
      } catch (error) {
        console.error("❌ Error en login:", error.message);
        res.status(401).json({ exito: false, mensaje: error.message });
      }
    });

    // ============================
    // Ruta para registrar usuario
    // ============================
    this.app.post("/api/auth/registrar", async (req, res) => {
      try {
        const { nombre, email, password } = req.body;
        if (!nombre || !email || !password) {
          return res.status(400).json({ exito: false, mensaje: "Todos los campos son requeridos" });
        }

        if (nombre.trim().length < 2) {
          return res.status(400).json({ exito: false, mensaje: "El nombre debe tener al menos 2 caracteres" });
        }

        if (password.length < 6) {
          return res.status(400).json({ exito: false, mensaje: "La contraseña debe tener al menos 6 caracteres" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ exito: false, mensaje: "Email inválido" });
        }

        console.log(`👤 Registrando usuario: ${email}`);
        const nuevoUsuario = await this.gestorUsuarios.crearUsuario({
          nombre: nombre.trim(),
          email: email.toLowerCase(),
          password,
        });

        console.log("✅ Registro exitoso");

        // --- INTEGRACIÓN ODOO ---
        try {
          console.log("🔍 Iniciando integración con Odoo...");

          const uid = await jsonRpcCall("call", {
            service: "common",
            method: "login",
            args: [DB, USERNAME, PASSWORD],
          });
          console.log("🔍 Autenticado en Odoo. UID:", uid);

          const partnerId = await jsonRpcCall("call", {
            service: "object",
            method: "execute_kw",
            args: [
              DB,
              uid,
              PASSWORD,
              "res.partner",
              "create",
              [{ name: nuevoUsuario.nombre, email: nuevoUsuario.email }],
            ],
          });
          console.log("✅ Contacto creado en Odoo:", partnerId);

          const leadId = await jsonRpcCall("call", {
            service: "object",
            method: "execute_kw",
            args: [
              DB,
              uid,
              PASSWORD,
              "crm.lead",
              "create",
              [{
                name: `Oportunidad de ${nuevoUsuario.nombre}`,
                partner_id: partnerId,
                email_from: nuevoUsuario.email,
              }],
            ],
          });
          console.log("✅ Oportunidad creada en Odoo:", leadId);
        } catch (err) {
          console.error("❌ Error enviando datos a Odoo CRM:", err.message);
        }

        // --- Email notificación ---
        try {
          await this.transportadorEmail.sendMail({
            from: process.env.EMAIL_USER,
            to: "info@assssa1.odoo.com", // cámbialo al correo que quieras usar en Odoo
            subject: "Nuevo registro de usuario (Sitio Web)",
            html: `<h3>Nuevo usuario registrado</h3>
                   <ul>
                     <li><b>Nombre:</b> ${nuevoUsuario.nombre}</li>
                     <li><b>Email:</b> ${nuevoUsuario.email}</li>
                   </ul>`,
          });
          console.log("✅ Correo enviado a Odoo CRM");
        } catch (err) {
          console.error("❌ Error enviando correo a Odoo CRM:", err.message);
        }

        res.status(201).json({
          exito: true,
          mensaje: "Usuario registrado exitosamente",
          usuario: nuevoUsuario,
        });
      } catch (error) {
        console.error("❌ Error en registro:", error.message);
        res.status(500).json({ exito: false, mensaje: error.message });
      }
    });

    // ============================
    // Ruta para recuperación
    // ============================
    this.app.post("/api/auth/olvide-contrasena", async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ exito: false, mensaje: "Email requerido" });

        const token = await this.gestorUsuarios.crearTokenRecuperacion(email);
        const enlace = `http://localhost:5500/restablecer-contrasena.html?token=${token}`;

        await this.transportadorEmail.sendMail({
          from: process.env.EMAIL_USER,
          to: email,
          subject: "Recuperación de contraseña - Golfito Tours",
          html: `<p>Hola,</p><p>Has solicitado restablecer tu contraseña.</p><p><a href='${enlace}'>Restablecer contraseña</a></p>`,
        });

        res.json({ exito: true, mensaje: "Correo enviado para restablecer contraseña" });
      } catch (error) {
        res.status(500).json({ exito: false, mensaje: error.message });
      }
    });

    // ============================
    // Ruta para restablecer contraseña
    // ============================
    this.app.post("/api/auth/restablecer-contrasena", async (req, res) => {
      try {
        const { token, nuevaContrasena } = req.body;
        if (!token || !nuevaContrasena) {
          return res.status(400).json({ exito: false, mensaje: "Token y contraseña requeridos" });
        }
        if (nuevaContrasena.length < 6) {
          return res.status(400).json({ exito: false, mensaje: "La contraseña debe tener al menos 6 caracteres" });
        }

        await this.gestorUsuarios.restablecerContrasena(token, nuevaContrasena);
        res.json({ exito: true, mensaje: "Contraseña restablecida exitosamente" });
      } catch (error) {
        res.status(500).json({ exito: false, mensaje: error.message });
      }
    });

    console.log("✅ Rutas de autenticación configuradas");
  }
}

module.exports = RutasAutenticacion;
