import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Check if local SSL certificates exist (for mobile camera access)
const httpsConfig = (() => {
  const keyPath = path.resolve(__dirname, 'certs/cert.key')
  const certPath = path.resolve(__dirname, 'certs/cert.crt')
  
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  }
  return undefined
})()

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    // Fix for sockjs-client which expects Node.js globals
    global: 'globalThis',
  },
  server: {
    host: '0.0.0.0',  // Allow external access
    port: 5173,       // Default Vite port
    strictPort: true, // Ensure the port doesn't switch automatically
    https: httpsConfig, // Enable HTTPS if certs exist
    proxy: {
      // Proxy API requests to backend - this allows cookies to work in development
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      // Proxy WebSocket connections to gateway
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
})
