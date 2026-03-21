import React from 'react'
import { createRoot } from 'react-dom/client'
import { DuesTransparency } from '../components/DuesTransparency'

console.log("HELLO FROM dues-entry.jsx: Script has successfully loaded!");

// Mount once the DOM is ready
function mountDuesTransparency() {
  console.log("mountDuesTransparency() called. Looking for DOM element...");
  const el = document.getElementById('dues-transparency-root')
  if (!el) {
    console.error("CRITICAL ERROR: 'dues-transparency-root' is missing from the DOM!");
    return
  }
  console.log("Found dues-transparency-root! Booting React...");
  const root = createRoot(el)
  root.render(<DuesTransparency />)
}

if (document.readyState === 'loading') {
  console.log("Document loading, adding DOMContentLoaded event listener...");
  document.addEventListener('DOMContentLoaded', mountDuesTransparency)
} else {
  console.log("Document ready state is: " + document.readyState + " ... executing immediately.");
  mountDuesTransparency()
}
