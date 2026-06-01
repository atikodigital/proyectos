const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

// Cargar variables de entorno del archivo .env
require('dotenv').config();

const config = {
  host: process.env.VPS_IP,
  port: 22,
  username: 'root',
  password: process.env.VPS_PASSWORD,
};

if (!config.host || !config.password) {
  console.error('Error: Faltan las variables VPS_IP o VPS_PASSWORD en el archivo .env');
  process.exit(1);
}

const localZipPath = path.join(__dirname, 'atiko-dist.zip');
const remoteZipPath = '/root/atiko-dist.zip';

if (!fs.existsSync(localZipPath)) {
  console.error(`Error: No se encuentra el archivo local ${localZipPath}. Asegúrate de que atiko-dist.zip se haya creado.`);
  process.exit(1);
}

const conn = new Client();

console.log(`Intentando conectar al VPS ${config.host} como root...`);

conn.on('ready', () => {
  console.log('Conectado con éxito por SSH!');
  
  // 1. Subir archivo zip por SFTP
  conn.sftp((err, sftp) => {
    if (err) throw err;
    
    console.log('Iniciando subida del archivo atiko-dist.zip vía SFTP...');
    sftp.fastPut(localZipPath, remoteZipPath, {}, (uploadErr) => {
      if (uploadErr) {
        console.error('Error al subir el archivo:', uploadErr);
        conn.end();
        process.exit(1);
      }
      
      console.log('Subida de zip completada!');
      
      // 2. Ejecutar comandos para desplegar en el servidor
      runSetupCommands();
    });
  });
}).on('error', (err) => {
  console.error('Error de conexión SSH:', err.message);
  process.exit(1);
}).connect(config);

function runSetupCommands() {
  console.log('Preparando comandos de instalación en el servidor...');
  
  // Lista de comandos a ejecutar en secuencia
  const commands = [
    // Actualizar e instalar unzip si no existe
    'apt-get update && apt-get install -y unzip',
    
    // Crear directorio para la web
    'mkdir -p /var/www/atikodigital',
    
    // Descomprimir el archivo en /var/www/atikodigital
    'unzip -o /root/atiko-dist.zip -d /var/www/atikodigital',
    
    // Limpiar el zip del servidor
    'rm -f /root/atiko-dist.zip',
    
    // Crear directorio de configuración de Caddy
    'mkdir -p /root/caddy',
    
    // Crear Caddyfile
    `cat << 'EOF' > /root/caddy/Caddyfile
atikodigital.cl, www.atikodigital.cl {
    root * /srv
    file_server
    encode gzip
    
    # Manejo de rutas limpias (HTML5 routing / clean URLs)
    @clean_path {
        file {path}/index.html
    }
    rewrite @clean_path {path}/index.html
}
EOF`,
    
    // Crear docker-compose.yml para Caddy
    `cat << 'EOF' > /root/caddy/docker-compose.yml
version: '3.8'

services:
  caddy:
    image: caddy:2-alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - /var/www/atikodigital:/srv
      - caddy_data:/data
      - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
EOF`,
    
    // Detener contenedor existente si lo hay y levantar docker compose
    'cd /root/caddy && docker compose down || true',
    'cd /root/caddy && docker compose up -d',
    
    // Mostrar contenedores activos
    'docker ps'
  ];
  
  executeSequence(commands, 0);
}

function executeSequence(commands, index) {
  if (index >= commands.length) {
    console.log('\n======================================================');
    console.log('¡DESPLIEGUE COMPLETADO CON ÉXITO EN TU VPS!');
    console.log('======================================================');
    console.log('El sitio web está en línea en https://atikodigital.cl');
    console.log('Caddy obtendrá el certificado SSL gratuito automáticamente.');
    console.log('Nota: Si el DNS de NIC Chile no ha terminado de propagarse,');
    console.log('puede tardar un momento en cargar en tu navegador.');
    console.log('======================================================');
    conn.end();
    return;
  }
  
  const cmd = commands[index];
  console.log(`\nEjecutando: ${cmd.split('\n')[0]}...`);
  
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error(`Error al ejecutar: ${cmd}`, err);
      conn.end();
      process.exit(1);
    }
    
    stream.on('close', (code, signal) => {
      if (code !== 0) {
        console.error(`Comando falló con código de salida ${code}`);
        conn.end();
        process.exit(1);
      }
      executeSequence(commands, index + 1);
    }).on('data', (data) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });
  });
}
