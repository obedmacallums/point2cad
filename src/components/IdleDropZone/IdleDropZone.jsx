import { useRef, useState } from 'react'
import { useCSVLoader } from '../../hooks/useCSVLoader'

export default function IdleDropZone() {
  const { loadFile } = useCSVLoader()
  const [isDragging, setIsDragging] = useState(false)
  // Contador de eventos dragenter/leave: el navegador dispara leave al cruzar elementos hijos,
  // así que sin esto el highlight parpadea.
  const dragCounter = useRef(0)
  const inputRef = useRef(null)

  function handleDragEnter(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!e.dataTransfer?.types?.includes('Files')) return
    dragCounter.current += 1
    setIsDragging(true)
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(e) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }

  async function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) await loadFile(file)
  }

  async function handleFileChange(e) {
    const file = e.target.files[0]
    await loadFile(file)
    inputRef.current.value = ''
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current.click()}
      className={`flex flex-col items-center justify-center h-full gap-4 m-4 sm:m-6 rounded-2xl border-2 border-dashed cursor-pointer transition-colors select-none ${
        isDragging
          ? 'border-blue-400 bg-blue-500/10 text-blue-300'
          : 'border-gray-700 hover:border-gray-500 text-gray-500 hover:text-gray-400'
      }`}
    >
      <svg
        className={`w-16 h-16 sm:w-20 sm:h-20 transition-transform ${isDragging ? 'scale-110' : 'opacity-50'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 16a4 4 0 01-.88-7.9A5.002 5.002 0 0117 9a4 4 0 011 7.87M12 12v9m0-9l-3 3m3-3l3 3"
        />
      </svg>

      <div className="flex flex-col items-center gap-1">
        <p className="text-base font-medium">
          {isDragging ? 'Suelta el archivo aquí' : 'Arrastra un archivo CSV'}
        </p>
        <p className="text-xs">
          {isDragging ? '' : 'o haz clic para seleccionarlo'}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
