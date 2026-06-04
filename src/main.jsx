import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PyodideProvider } from './context/PyodideContext'
import { AppProvider } from './context/AppContext'
import { AuthProvider } from './context/AuthContext'
import AuthGate from './components/AuthGate/AuthGate'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <PyodideProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </PyodideProvider>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
