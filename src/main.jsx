import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PyodideProvider } from './context/PyodideContext'
import { AppProvider } from './context/AppContext'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PyodideProvider>
      <AppProvider>
        <App />
      </AppProvider>
    </PyodideProvider>
  </StrictMode>
)
