
// Carga las variables de entorno desde el archivo .env para configurar credenciales y otros parámetros sensibles.
require("dotenv").config()

console.log("EMAIL_USER:", process.env.EMAIL_USER)
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "[OK]" : "[MISSING]")

const express = require("express")
const path = require("path")
const nodemailer = require("nodemailer")
const RutasAutenticacion = require("./rutas-autenticacion")
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3000

// ✅ MIDDLEWARE DEBE IR ANTES DE LAS RUTAS
// Configura los middlewares globales para el servidor Express:
// - express.json(): Permite recibir datos en formato JSON en las peticiones.
// - express.urlencoded(): Permite recibir datos de formularios HTML.
// - express.static(): Sirve archivos estáticos (HTML, CSS, JS, imágenes) desde la raíz del proyecto.
// - cors(): Permite solicitudes desde otros orígenes (útil para desarrollo y APIs).
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "..")))
app.use(cors())

// 🔍 Debug: Verificar variables de entorno
console.log("🔍 Verificando variables de entorno:")
console.log("EMAIL_USER:", process.env.EMAIL_USER ? "✅ Configurado" : "❌ No encontrado")
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "✅ Configurado" : "❌ No encontrado")

// 📧 Configuración de nodemailer
let transportadorEmail = null

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  try {
    transportadorEmail = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
    })
    console.log("✅ Transportador de email configurado")

    // Test de conexión
    transportadorEmail.verify((error, success) => {
      if (error) {
        console.log("❌ Error de verificación:", error.message)
      } else {
        console.log("✅ Servidor de email listo para enviar mensajes")
      }
    })
  } catch (error) {
    console.error("❌ Error configurando email:", error.message)
  }
} else {
  console.log("⚠️  Variables de email no configuradas")
}

// ✅ CONFIGURAR RUTAS DE AUTENTICACIÓN ANTES DE OTRAS RUTAS
// Inicializa y configura las rutas de autenticación y recuperación de contraseña antes de las rutas estáticas.
console.log("🔧 Configurando rutas de autenticación...")
const rutasAuth = new RutasAutenticacion(app, transportadorEmail)

// ✅ RUTAS ESTÁTICAS (DESPUÉS DE LAS RUTAS DE API)
// Define las rutas para servir los archivos HTML principales del sitio web.
// Cada ruta responde con el archivo HTML correspondiente para cada sección del sitio.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"))
})

app.get("/naturaleza", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "naturaleza.html"))
})

app.get("/aventura", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "aventura.html"))
})

app.get("/playas", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "playas.html"))
})

app.get("/historia", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "historia.html"))
})

app.get("/contacto", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "contacto.html"))
})

app.get("/reserva", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "reserva.html"))
})

// 📧 RUTA DE CONTACTO
// Ruta para procesar el formulario de contacto. Valida los datos y envía un correo electrónico al usuario y al administrador.
app.post("/api/contacto", async (req, res) => {
  try {
    console.log(" INICIANDO PROCESO DE CONTACTO ")
    console.log("Datos recibidos:", req.body)

    const { nombre, email, telefono, asunto, mensaje } = req.body

    if (!nombre || !email || !asunto || !mensaje) {
      console.log("❌ Faltan campos obligatorios")
      return res.status(400).json({
        success: false,
        mensaje: "Todos los campos obligatorios son requeridos",
      })
    }

    if (!transportadorEmail) {
      console.log("❌ Transportador de email no configurado")
      return res.status(500).json({
        success: false,
        mensaje: "Servicio de email no configurado",
      })
    }

    console.log("✅ Validaciones pasadas, enviando email...")

    const opcionesEmail = {
      from: 'golfitotourstop@gmail.com',
      to: email,
      bcc: 'golfitotourstop@gmail.com',
      subject: `Nuevo mensaje de contacto: ${asunto}`,
      html: `
        <img src="cid:imagenGolfito2" alt="Golfito2" style="max-width: 100%; border-radius: 10px; margin-bottom: 10px;"/>
        <h2>Nuevo mensaje de contacto</h2>
        <p><strong>Nombre:</strong> ${nombre}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Teléfono:</strong> ${telefono || "No proporcionado"}</p>
        <p><strong>Asunto:</strong> ${asunto}</p>
        <p><strong>Mensaje:</strong> ${mensaje}</p>
        <hr>
        <p style='color:red;'><strong>Golfito2:</strong> Ahorita no tenemos personal.</p>
        <p>Enviado el: ${new Date().toLocaleString("es-CR")}</p>
      `,
      attachments: [
        {
          filename: 'golfito2.jpg',
          path: require('path').join(__dirname, '../imagenes/golfito2.jpg'),
          cid: 'imagenGolfito2'
        }
      ]
    }

    console.log(" Enviando email...")
    const resultado = await transportadorEmail.sendMail(opcionesEmail)
    console.log("✅ Email enviado exitosamente:", resultado.messageId)

    res.json({
      success: true,
      mensaje: "Mensaje enviado exitosamente",
    })
  } catch (error) {
    console.error("❌ ERROR COMPLETO:", error)
    res.status(500).json({
      success: false,
      mensaje: `Error enviando mensaje: ${error.message}`,
    })
  }
})

// �� RUTA DE RESERVA
// Ruta para procesar el formulario de reserva de tours. Valida los datos y envía un correo electrónico de confirmación.
// 📦 DEPENDENCIAS NECESARIAS
const fs = require("fs");
const { fetch } = require("undici");

// --- CONFIGURACIÓN ODOO ---
const ODOO_URL = process.env.ODOO_URL;
const DB = process.env.ODOO_DB;
const USERNAME = process.env.ODOO_USER;
const PASSWORD = process.env.ODOO_PASS;

// --- FUNCIÓN GENÉRICA PARA LLAMADAS JSON-RPC ---
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

// ========================================================
// 📩 RUTA DE RESERVA (INTEGRADA CON ODOO + CORREO + JSON)
// ========================================================
app.post("/api/reserva", async (req, res) => {
  try {
    console.log("🧾 INICIANDO PROCESO DE RESERVA");
    console.log("📦 Datos recibidos:", req.body);

    const {
      nombreCompleto,
      emailReserva,
      telefonoReserva,
      fechaTour,
      tourSeleccionado,
      numeroPersonas,
      horarioPreferido,
      comentariosReserva,
    } = req.body;

    // 🔍 Validación de campos obligatorios
    if (
      !nombreCompleto ||
      !emailReserva ||
      !telefonoReserva ||
      !fechaTour ||
      !tourSeleccionado ||
      !numeroPersonas
    ) {
      console.log("❌ Faltan campos obligatorios");
      return res.status(400).json({
        success: false,
        mensaje: "Todos los campos obligatorios son requeridos",
      });
    }

    // ========================================================
    // 🧩 INTEGRACIÓN CON ODOO
    // ========================================================
    console.log("🔗 Conectando con Odoo en:", ODOO_URL);
    const uid = await jsonRpcCall("call", {
      service: "common",
      method: "login",
      args: [DB, USERNAME, PASSWORD],
    });

    if (!uid || uid === false) {
      throw new Error("No se pudo autenticar en Odoo. Revisa API Key o credenciales.");
    }
    console.log("🔑 Autenticado en Odoo. UID:", uid);

    // --- Buscar o crear el contacto ---
    const partners = await jsonRpcCall("call", {
      service: "object",
      method: "execute_kw",
      args: [
        DB,
        uid,
        PASSWORD,
        "res.partner",
        "search_read",
        [[["email", "=", emailReserva]]],
        ["id", "name", "email"],
      ],
    });

    let partnerId;
    if (partners.length > 0) {
      partnerId = partners[0].id;
      console.log("✅ Contacto existente encontrado:", partnerId);
    } else {
      partnerId = await jsonRpcCall("call", {
        service: "object",
        method: "execute_kw",
        args: [
          DB,
          uid,
          PASSWORD,
          "res.partner",
          "create",
          [{ name: nombreCompleto, email: emailReserva, phone: telefonoReserva }],
        ],
      });
      console.log("✅ Nuevo contacto creado en Odoo:", partnerId);
    }

    // --- Crear cotización (sale.order) ---
    const fechaVencimiento = fechaTour;
    const terminoPago = "Inmediato";
    let paymentTermId = null;

    const terms = await jsonRpcCall("call", {
      service: "object",
      method: "execute_kw",
      args: [
        DB,
        uid,
        PASSWORD,
        "account.payment.term",
        "search_read",
        [[["name", "ilike", terminoPago]]],
        ["id", "name"],
      ],
    });
    if (terms.length > 0) paymentTermId = terms[0].id;

    const orderId = await jsonRpcCall("call", {
      service: "object",
      method: "execute_kw",
      args: [
        DB,
        uid,
        PASSWORD,
        "sale.order",
        "create",
        [
          {
            partner_id: partnerId,
            validity_date: fechaVencimiento,
            payment_term_id: paymentTermId,
            state: "draft",
          },
        ],
      ],
    });

    console.log("🧾 Cotización creada en Odoo con ID:", orderId);

    // --- Crear líneas de productos ---
    const productos = [
      {
        nombre: tourSeleccionado,
        cantidad: parseInt(numeroPersonas),
        precio: 45, // puedes ajustar según tour
      },
    ];

    for (const p of productos) {
      await jsonRpcCall("call", {
        service: "object",
        method: "execute_kw",
        args: [
          DB,
          uid,
          PASSWORD,
          "sale.order.line",
          "create",
          [
            {
              order_id: orderId,
              name: p.nombre,
              product_uom_qty: p.cantidad,
              price_unit: p.precio,
            },
          ],
        ],
      });
      console.log(`✅ Línea de producto añadida: ${p.nombre} (${p.cantidad} x ${p.precio})`);
    }

    console.log("🎉 Cotización creada correctamente en Odoo");

    // ========================================================
    // ✉️ ENVÍO DE CORREO (mantiene tu formato actual)
    // ========================================================
    if (!transportadorEmail) {
      console.log("❌ Transportador de email no configurado");
      return res.status(500).json({
        success: false,
        mensaje: "Servicio de email no configurado",
      });
    }

    const imagenesDir = path.join(__dirname, "../imagenes");
    let imagenAdjunta = null;
    const archivos = fs.readdirSync(imagenesDir);
    const nombreTourNormalizado = tourSeleccionado.toLowerCase().replace(/\s+/g, "");
    for (const archivo of archivos) {
      const nombreArchivoNormalizado = archivo.toLowerCase().replace(/\s+/g, "");
      if (nombreArchivoNormalizado.includes(nombreTourNormalizado)) {
        imagenAdjunta = path.join(imagenesDir, archivo);
        break;
      }
    }
    if (!imagenAdjunta) imagenAdjunta = path.join(imagenesDir, "golfito2.jpg");

    const opcionesEmail = {
      from: "golfitotourstop@gmail.com",
      to: emailReserva,
      bcc: "golfitotourstop@gmail.com",
      subject: `Confirmación de Reserva – ${tourSeleccionado}`,
      html: `
        <img src="cid:imagenTour" alt="Imagen del tour" style="max-width: 100%; border-radius: 10px; margin-bottom: 10px;"/>
        <p>Estimado/a <strong>${nombreCompleto}</strong>,</p>
        <p>Tu reserva en <strong>${tourSeleccionado}</strong> fue registrada exitosamente.</p>
        <ul>
          <li><strong>Fecha:</strong> ${fechaTour}</li>
          <li><strong>Personas:</strong> ${numeroPersonas}</li>
          <li><strong>Horario:</strong> ${horarioPreferido || "No especificado"}</li>
        </ul>
        <p>Referencia de cotización en Odoo: #${orderId}</p>
        <p>Gracias por elegir <strong>Zenda Tours</strong>.</p>
      `,
      attachments: [
        { filename: path.basename(imagenAdjunta), path: imagenAdjunta, cid: "imagenTour" },
      ],
    };

    console.log("✉️ Enviando correo de reserva...");
    const resultado = await transportadorEmail.sendMail(opcionesEmail);
    console.log("✅ Correo enviado exitosamente:", resultado.messageId);

    // ========================================================
    // 💾 GUARDAR RESERVA EN ARCHIVO LOCAL
    // ========================================================
    const reservasPath = path.join(__dirname, "../datos/reservas.json");
    let reservas = [];
    if (fs.existsSync(reservasPath)) {
      try {
        reservas = JSON.parse(fs.readFileSync(reservasPath, "utf8"));
      } catch (e) {
        reservas = [];
      }
    }

    const nuevaReserva = {
      nombreCompleto,
      emailReserva,
      telefonoReserva,
      fechaTour,
      tourSeleccionado,
      numeroPersonas,
      horarioPreferido,
      comentariosReserva,
      cotizacion_id: orderId,
      fechaCreacion: new Date().toISOString(),
    };
    reservas.push(nuevaReserva);
    fs.writeFileSync(reservasPath, JSON.stringify(reservas, null, 2));
    console.log("💾 Reserva guardada en archivo local.");

    // ========================================================
    // ✅ RESPUESTA FINAL
    // ========================================================
    res.json({
      success: true,
      mensaje: "Reserva registrada y enviada a Odoo exitosamente.",
      cotizacion_id: orderId,
    });

  } catch (error) {
    console.error("❌ ERROR COMPLETO:", error);
    res.status(500).json({
      success: false,
      mensaje: `Error enviando reserva: ${error.message}`,
    });
  }
});

// ✅ MIDDLEWARE DE MANEJO DE ERRORES 404
app.use((req, res) => {
  console.log(`❌ Ruta no encontrada: ${req.method} ${req.url}`)
  res.status(404).json({
    success: false,
    mensaje: `Ruta no encontrada: ${req.method} ${req.url}`,
  })
})

// ✅ MIDDLEWARE DE MANEJO DE ERRORES GENERALES
app.use((error, req, res, next) => {
  console.error("❌ Error del servidor:", error)
  res.status(500).json({
    success: false,
    mensaje: "Error interno del servidor",
  })
})

// Iniciar servidor
app.listen(PORT, () => {
  console.log(` Servidor ejecutándose en http://localhost:${PORT}`)
  console.log(` Email configurado: ${transportadorEmail ? "Sí" : "No"}`)
  console.log(" Rutas de autenticación configuradas")
  console.log(" Archivos estáticos servidos desde:", path.join(__dirname, ".."))
})