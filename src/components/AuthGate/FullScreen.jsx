export default function FullScreen({ children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-gray-950 text-gray-100">
      {children}
    </div>
  )
}
