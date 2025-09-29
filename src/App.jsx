
import './App.css'
import { APIProvider } from '@vis.gl/react-google-maps'
import GoogleMap from './page/GoogleMap'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;


function App() {

  return (
    <>
      <APIProvider
        apiKey={API_KEY} onLoad={() => console.log("Maps API loaded")}>
        <GoogleMap />
      </APIProvider>
    </>
  )
}

export default App
