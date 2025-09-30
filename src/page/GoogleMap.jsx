import { useEffect, useRef, useState } from "react";
import { MdGpsFixed, MdSearch } from "react-icons/md";
import {
    Map,
    InfoWindow,
    AdvancedMarker,
    useAdvancedMarkerRef,
    useMap,
    useMapsLibrary,
    Pin,

} from "@vis.gl/react-google-maps";

// Define your custom markers
const DestinationPin = () => (
    <Pin
        background={"#FF0000"} // Red for destination
        borderColor={"#CC0000"}
        glyphColor={"#FFFFFF"}
    />
);

const NearbyPlacePin = () => (
    <Pin
        background={"#4285F4"} // Blue for nearby places
        borderColor={"#3367D6"}
        glyphColor={"#FFFFFF"}
    />
);

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in kilometers
    const radLat1 = (lat1 * Math.PI) / 180;
    const radLon1 = (lon1 * Math.PI) / 180;
    const radLat2 = (lat2 * Math.PI) / 180;
    const radLon2 = (lon2 * Math.PI) / 180;

    const deltaLat = radLat2 - radLat1;
    const deltaLon = radLon2 - radLon1;

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(radLat1) * Math.cos(radLat2) *
        Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in kilometers
    return distance;
}


export default function GoogleMap() {
    // Get a photo URL from a Places Photo object safely
    const getPhotoUrl = (place, size = 300) => {
        const photoObj = place?.photos?.[0];
        try {
            return photoObj?.getUrl({ maxWidth: size, maxHeight: size });
        } catch {
            return null;
        }
    };

    // Fetch full place details (incl. photos) when you only have place_id
    const fetchPlaceDetails = (service, placeId) => {
        console.log('fetching running')

        return (
            new Promise((resolve) => {
                if (!placeId) return resolve(null);
                service.getDetails(
                    {
                        placeId,
                        fields: [
                            "name",
                            "formatted_address",
                            "rating",
                            "user_ratings_total",
                            "photos",
                            "geometry",
                            "place_id",
                        ],
                    },
                    (place, status) => {
                        if (
                            status !== window.google.maps.places.PlacesServiceStatus.OK ||
                            !place
                        ) {
                            return resolve(null);
                        }
                        resolve(place);
                    }
                );
            })

        )
    }

    const destInputRef = useRef(null);
    const nearbyInputRef = useRef(null);

    const map = useMap();
    const placesLib = useMapsLibrary("places");
    const geometryLib = useMapsLibrary("geometry");
    // const geocoderLib = useMapsLibrary("geocoder");  // Add geocoder here

    // Main marker ref + a stateful position we control
    const [markerRef] = useAdvancedMarkerRef();
    const [markerPos, setMarkerPos] = useState(null);
    const [defaultPos, setDefaultPos] = useState(null);

    const [isLocReady, setIsLocReady] = useState(false);
    const [locError, setLocError] = useState(null);

    // Place picked via Autocomplete (for InfoWindow on the main marker)
    const [pickedPlace, setPickedPlace] = useState(null);
    const [radius, setRadius] = useState(1000);  // Default radius is 1000 meters

    const handleRadiusChange = (e) => {
        setRadius(e.target.value);
    };

    const lastPickedMetaRef = useRef({
        name: "",
        formatted_address: "",
        rating: undefined,
        user_ratings_total: undefined,
    });

    // Nearby search state
    const [results, setResults] = useState([]);
    const [activePlace, setActivePlace] = useState(null);
    const [searchCircle, setSearchCircle] = useState(null);

    // control whether the main dest InfoWindow should stay open even if mouse leaves
    const [pickedPinned, setPickedPinned] = useState(false);
    // debounce hover so it doesn't flicker
    const pickedHoverTimerRef = useRef(null);

    const [newPosition, setNewPosition] = useState(null)
    const [intervalId, setIntervalId] = useState(null); // Store interval ID for stopping
    const [showInfoWindow, setShowInfoWindow] = useState(false); // State to toggle InfoWindow visibility


    function takeCoordinate() {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                // const lat = pos.coords.latitude;
                // const lon = pos.coords.longitude;
                // console.log('Latitude:', lat, 'Longitude:', lon);  // Logs lat and lon
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                if (markerPos) {
                    const distance = calculateDistance(markerPos.lat, markerPos.lng, loc.lat, loc.lng);
                    console.log("Distance moved:", distance, "km");
                    // Check if the distance is greater than or equal to 1 km
                    // Check if the distance is greater than or equal to 1 km (1000 meters)
                    if (nearbyInputRef.current.value === '') {
                        console.log('taha')
                    }
                    if (distance >= 1) {
                        console.log("Distance is greater than or equal to 1 km, calling runNearbySearch");

                        // Call the nearby search function
                        runNearbySearch(nearbyInputRef.current.value);


                        // Stop further distance calculation and clear the interval
                        console.log("Stopped fetching coordinates as distance is greater than 1 km.");
                    } else {
                        console.log('smaller')
                    }
                }
                setNewPosition(loc);
                setMarkerPos(loc); // Update the last known position
                setShowInfoWindow(true); // Show InfoWindow when position is updated
            },
            (err) => {
                console.error('Error fetching location:', err.message);
            }
        );
    }
    // console.log(intervalId)

    const handleStop = () => {
        // Clear the interval if it's running
        if (intervalId) {
            clearInterval(intervalId); // Stop the interval
            setIntervalId(null); // Clear the saved interval ID
            console.log("Stopped fetching coordinates");
        } else {
            console.log("No interval is currently running");
        }
    };

    const handlePlay = () => {
        // Only start a new interval if one is not already running
        if (!intervalId) {
            const id = setInterval(takeCoordinate, 10000);  // Run every 10 seconds
            setIntervalId(id); // Save the interval ID to state
            console.log("Started fetching coordinates every 10 seconds");
        }
    };


    const visualizeSearchRadius = (center, radius) => {
        // Remove previous circle if exists
        if (searchCircle) {
            searchCircle.setMap(null);
        }

        const circle = new window.google.maps.Circle({
            strokeColor: "#FF0000",
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: "#FF0000",
            fillOpacity: 0.1,
            map: map,
            center: center,
            radius: radius,
        });

        setSearchCircle(circle);
    };

    useEffect(() => {
        if (!navigator.geolocation) {
            setLocError("Geolocation is not supported by this browser.");
            setIsLocReady(true);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setDefaultPos(loc)
                setMarkerPos(loc);
                setIsLocReady(true);


                // geocoder.geocode({ location: loc }, (results, status) => {
                //     if (status === window.google.maps.GeocoderStatus.OK && results?.[0]) {
                //         // Retrieve the formatted address and place name dynamically
                //         const placeName = results[0].formatted_address || "Unknown Location";

                //         // Update the stored metadata with the dynamic name
                //         lastPickedMetaRef.current = {
                //             name: placeName, // Dynamically fetched name
                //             formatted_address: results[0].formatted_address,
                //             rating: undefined,
                //             user_ratings_total: undefined,
                //         };

                //         setPickedPlace({
                //             ...lastPickedMetaRef.current,
                //             geometry: { location: new window.google.maps.LatLng(loc.lat, loc.lng) },
                //         });
                //     } else {
                //         console.error("Geocoding failed: ", status);
                //     }
                // });

                // const geocoder = new window.google.maps.Geocoder();

                // Reverse Geocode to get the address
                // geocoder.geocode({ location: loc }, (results, status) => {
                //     if (status === "OK" && results?.[0]) {
                //         const place = results[0];
                //         const formattedAddress = place.formatted_address || "";
                //         const placeName = place.address_components?.[0]?.long_name || "Current Location";

                //         lastPickedMetaRef.current = {
                //             name: placeName,
                //             formatted_address: formattedAddress,
                //             rating: undefined,
                //             user_ratings_total: undefined,
                //         };

                //         setPickedPlace({
                //             ...lastPickedMetaRef.current,
                //             geometry: { location: new window.google.maps.LatLng(loc.lat, loc.lng) },
                //         });

                //         // Update the map center and zoom
                //         map.setCenter(loc);
                //         map.setZoom(15);
                //     } else {
                //         setLocError("Unable to get address from current location.");
                //     }
                // });
            },
            (err) => {
                setLocError(err.message || "Unable to fetch your location.");
                setIsLocReady(true);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, [map]);
    // console.log('Lat Lang start')
    // console.log(markerPos)
    // console.log('Lat Lang end')
    // console.log('-----------------------------')
    // console.log('NEW Lat Lang start')
    // console.log(newPosition)
    // console.log('NEW Lat Lang end')


    // ── Initialize Google Autocomplete on the destination input ──────────────
    useEffect(() => {
        console.log('running continously')
        if (!placesLib || !geometryLib || !destInputRef.current || !window.google || !map) return;

        const ac = new window.google.maps.places.Autocomplete(destInputRef.current, {
            fields: ["geometry", "name", "formatted_address", "place_id", "rating", "user_ratings_total"],
            types: ["geocode"],
        });

        const listener = ac.addListener("place_changed", async () => {
            const place = ac.getPlace();
            if (!place?.geometry?.location) return;

            const loc = place.geometry.location;
            const next = { lat: loc.lat(), lng: loc.lng() };

            // Persist basic meta
            lastPickedMetaRef.current = {
                name: place.name || "Selected location",
                formatted_address: place.formatted_address || "",
                rating: place.rating,
                user_ratings_total: place.user_ratings_total,
            };

            map.panTo(next);
            map.setZoom(15);
            setMarkerPos(next);
            setActivePlace(null);
            setPickedPinned(false);

            // NEW: fetch full details to get photos
            const service = new placesLib.PlacesService(map);
            const full = await fetchPlaceDetails(service, place.place_id);

            // Build final pickedPlace (fallback to basic meta if details missing)
            const finalPicked = full || {
                ...lastPickedMetaRef.current,
                geometry: { location: new window.google.maps.LatLng(next.lat, next.lng) },
                place_id: place.place_id,
            };

            setPickedPlace(finalPicked);
        });

        return () => listener?.remove();
    }, [placesLib, geometryLib, map]);


    // Helper: current center for searching
    const getSearchCenter = () => {
        if (markerPos) {
            return new window.google.maps.LatLng(markerPos.lat, markerPos.lng);
        }
        if (map) return map.getCenter();
        return new window.google.maps.LatLng(origin.lat, origin.lng);
    };

    // ── Run Nearby Search (Corrected) ────────────────────────────────────────────────
    const runNearbySearch = (query) => {
        if (!placesLib || !map || !window.google || !query?.trim()) return;

        const service = new placesLib.PlacesService(map);
        const center = getSearchCenter();

        // CORRECTED: Use nearbySearch with proper parameters
        const request = {
            keyword: query.trim(),      // Use 'keyword' instead of 'query'
            location: center,
            radius: Number(radius),  // Use the radius provided by the user
        };

        service.nearbySearch(request, (res, status) => {
            if (status !== window.google.maps.places.PlacesServiceStatus.OK || !res) {
                console.log("Nearby search failed:", status);
                setResults([]);
                setActivePlace(null);

                if (status === "ZERO_RESULTS") {
                    alert(`No places found within ${radius} meters. Try a larger radius or different search term.`);
                }
                return;
            }

            // Filter to ensure only results within 1000m are shown
            const centerLatLng = new window.google.maps.LatLng(center.lat(), center.lng());
            const filteredResults = res.filter(place => {
                if (!place.geometry?.location) return false;

                // Calculate actual distance
                const distance = window.google.maps.geometry.spherical.computeDistanceBetween(
                    centerLatLng,
                    place.geometry.location
                );

                // return distance <= 1000; // Strict 1000m filter
                return distance <= Number(radius);  // Apply the radius filter
            }).slice(0, 20);

            setResults(filteredResults);
            setActivePlace(null);

            // Visualize the 1000m radius
            visualizeSearchRadius(center, Number(radius));

            if (filteredResults.length > 0) {
                const bounds = new window.google.maps.LatLngBounds();
                filteredResults.forEach((p) => p.geometry?.location && bounds.extend(p.geometry.location));
                if (!bounds.isEmpty()) {
                    map.fitBounds(bounds, { padding: 20 });
                }
            } else {
                // If no results, just center on the search point
                // map.setCenter(center);
                map.setZoom(17); // Zoom level that shows ~1000m area
                alert("No places found within 1000 meters.");
            }
        });
    };

    const handleNearbyKeyDown = (e) => {
        if (e.key === "Enter") runNearbySearch(nearbyInputRef.current.value);
    };

    // If we don't have the user's location yet, show a minimal loader UI.
    if (!isLocReady && !markerPos) {
        return (
            <div className="mainBox">
                <div className="header" style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div>Requesting your location… please allow access.</div>
                </div>
            </div>
        );
    }
    // console.log('defaultPos --> ', defaultPos)
    // console.log('markerPos --> ', markerPos)
    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="mainBox">
            {/* <div className="header" style={{ display: "", gap: 1, alignItems: "center" }}>
                <button
                    className="gpsBtn"
                    title="Go to my location"
                    onClick={() => {
                        if (!map || !navigator.geolocation) return;

                        navigator.geolocation.getCurrentPosition((pos) => {
                            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };

                            // Pan to the current location and set zoom level
                            map.panTo(loc);
                            map.setZoom(15);
                            setMarkerPos(loc);     // Move the main marker to the new location

                            // Reverse geocoding to get the name of the location
                            const geocoder = new window.google.maps.Geocoder();
                            geocoder.geocode({ location: loc }, (results, status) => {
                                if (status === window.google.maps.GeocoderStatus.OK && results?.[0]) {
                                    // Retrieve the formatted address and place name dynamically
                                    const placeName = results[0].formatted_address || "Unknown Location";

                                    // Update the stored metadata with the dynamic name
                                    lastPickedMetaRef.current = {
                                        name: placeName, // Dynamically fetched name
                                        formatted_address: results[0].formatted_address,
                                        rating: undefined,
                                        user_ratings_total: undefined,
                                    };

                                    setPickedPlace({
                                        ...lastPickedMetaRef.current,
                                        geometry: { location: new window.google.maps.LatLng(loc.lat, loc.lng) },
                                    });
                                } else {
                                    console.error("Geocoding failed: ", status);
                                }
                            });

                            setActivePlace(null);
                        });
                    }}
                >
                    <MdGpsFixed className="gpsIcon" />
                </button>


                <div className="inputGroup" style={{
                    // position: "relative",
                    // flex: 1,
                    maxWidth: 420,
                    display: "flex",
                    alignItems: "center"
                }}>
                    <input
                        ref={destInputRef}
                        type="text"
                        placeholder="Set destination (search a place)"
                        className="searchInput"
                        style={{
                            width: "100%",
                            paddingRight: 36,
                            height: 40 // Added consistent height
                        }}
                    />
                    <MdSearch className="searchIcon" style={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)"
                    }} />
                </div>

                <div className="inputGroup" style={{ display: "flex", maxWidth: 320, width: "100%", gap: 8 }}>
                    <input
                        ref={nearbyInputRef}
                        type="text"
                        placeholder="Search nearby (e.g., hotel, cafe, mandir)"
                        className="searchInput"
                        onKeyDown={handleNearbyKeyDown}
                        style={{ flex: 1 }}
                    />
                    <input
                        id="radius"
                        type="number"
                        value={radius}
                        onChange={handleRadiusChange}
                        min="100"
                        max="5000"
                        step="100"
                        style={{ width: "100px", marginRight: "10px" }}
                    />
                    <button
                        className="gpsBtn"
                        title="Search nearby"
                        onClick={() => runNearbySearch(nearbyInputRef.current.value)}
                    >
                        <MdSearch className="gpsIcon" />
                    </button>
                    <button onClick={handlePlay}>Play</button>
                    <button onClick={handleStop}>Stop</button>


                </div>
            </div> */}
            <div className="header">
                {/* Current Location */}
                <button
                    className="btn iconBtn"
                    title="Go to my location"
                    onClick={() => {
                        if (!map || !navigator.geolocation) return;
                        navigator.geolocation.getCurrentPosition((pos) => {
                            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                            map.panTo(loc);
                            map.setZoom(15);
                            setMarkerPos(loc);

                            const geocoder = new window.google.maps.Geocoder();
                            geocoder.geocode({ location: loc }, (results, status) => {
                                if (status === window.google.maps.GeocoderStatus.OK && results?.[0]) {
                                    const placeName = results[0].formatted_address || "Unknown Location";
                                    lastPickedMetaRef.current = {
                                        name: placeName,
                                        formatted_address: results[0].formatted_address,
                                        rating: undefined,
                                        user_ratings_total: undefined,
                                    };
                                    setPickedPlace({
                                        ...lastPickedMetaRef.current,
                                        geometry: { location: new window.google.maps.LatLng(loc.lat, loc.lng) },
                                    });
                                } else {
                                    console.error("Geocoding failed: ", status);
                                }
                            });

                            setActivePlace(null);
                        });
                    }}
                >
                    <MdGpsFixed className="icon" />
                    <span className="btnText">My location</span>
                </button>

                {/* Destination Search */}
                <div className="field field--grow header__dest">
                    <input
                        ref={destInputRef}
                        type="text"
                        placeholder="Set destination (search a place)"
                        className="input"
                        aria-label="Destination"
                    />
                    <MdSearch className="field__icon" />
                </div>

                {/* Nearby + Radius + Controls */}
                <div className="header__nearby">
                    <div className="field field--grow">
                        <input
                            ref={nearbyInputRef}
                            type="text"
                            placeholder="Search nearby (e.g., hotel, cafe, mandir)"
                            className="input"
                            onKeyDown={handleNearbyKeyDown}
                            aria-label="Nearby search"
                        />
                        <MdSearch className="field__icon" />
                    </div>

                    <label className="radius">
                        <span className="radius__label">Radius</span>
                        <input
                            id="radius"
                            type="number"
                            value={radius}
                            onChange={handleRadiusChange}
                            min="100"
                            max="5000"
                            step="100"
                            className="input radius__input"
                            aria-label="Search radius in meters"
                        />
                        <span className="radius__unit">m</span>
                    </label>

                    <button
                        className="btn iconBtn"
                        title="Search nearby"
                        onClick={() => runNearbySearch(nearbyInputRef.current?.value || "")}
                    >
                        <MdSearch className="icon" />
                        <span className="btnText">Search</span>
                    </button>

                    <button className="btn" onClick={handlePlay}>Play</button>
                    <button className="btn btn--ghost" onClick={handleStop}>Stop</button>
                </div>
            </div>


            <div className="contentBox" style={{ position: "relative", height: "70vh", marginTop: 8 }}>
                <Map
                    mapId={"bf51a910020fa25a"}
                    defaultZoom={13}
                    defaultCenter={markerPos}
                    gestureHandling={"greedy"}
                    disableDefaultUI={true}
                >
                    {/* Main AdvancedMarker that moves to the searched place */}
                    <AdvancedMarker
                        position={markerPos}
                        onMouseOver={() => {
                            // if already pinned, don't auto-close/open on hover
                            if (pickedPinned) return;
                            // open after a short delay to avoid jitter
                            clearTimeout(pickedHoverTimerRef.current);
                            pickedHoverTimerRef.current = setTimeout(() => {
                                setPickedPlace({
                                    ...lastPickedMetaRef.current,
                                    geometry: { location: new window.google.maps.LatLng(markerPos.lat, markerPos.lng) },
                                });
                            }, 120);
                        }}
                        onMouseOut={() => {
                            if (pickedPinned) return; // keep open if pinned
                            clearTimeout(pickedHoverTimerRef.current);
                            // close after a short delay so you can move into the InfoWindow without it vanishing
                            pickedHoverTimerRef.current = setTimeout(() => {
                                setPickedPlace(null);
                            }, 180);
                        }}
                        onClick={() => {
                            const ll = new window.google.maps.LatLng(markerPos.lat, markerPos.lng);
                            setActivePlace(null);
                            setPickedPlace({
                                ...lastPickedMetaRef.current,
                                geometry: { location: ll },
                            });
                        }}
                    >
                        <DestinationPin />
                    </AdvancedMarker>

                    {/* Displaying InfoWindow on the map */}
                    {/* {newPosition && (
                        <InfoWindow
                            position={new window.google.maps.LatLng(newPosition.lat, newPosition.lng)} // Place InfoWindow at newPosition
                            onCloseClick={() => setShowInfoWindow(false)} // Close InfoWindow when clicked
                            visible={showInfoWindow} // Toggle visibility
                        >
                            <div>
                                <h3>New Position</h3>
                                <p>Latitude: {newPosition.lat}</p>
                                <p>Longitude: {newPosition.lng}</p>
                                <h4>Last Position</h4>
                                <p>Latitude: {markerPos ? markerPos.lat : "Not available"}</p>
                                <p>Longitude: {markerPos ? markerPos.lng : "Not available"}</p>
                            </div>
                        </InfoWindow>
                    )} */}

                    {/* InfoWindow for the main marker (picked destination) */}
                    {pickedPlace?.geometry?.location && (
                        <InfoWindow
                            position={pickedPlace.geometry.location}
                            onCloseClick={() => setPickedPlace(null)}
                        >
                            <div style={{ maxWidth: 260 }}>
                                {/* PHOTO */}
                                {getPhotoUrl(pickedPlace, 360) && (
                                    <img
                                        src={getPhotoUrl(pickedPlace, 360)}
                                        alt={pickedPlace.name || "Place photo"}
                                        style={{
                                            width: "100%",
                                            height: 140,
                                            objectFit: "cover",
                                            borderRadius: 8,
                                            marginBottom: 8,
                                        }}
                                        loading="lazy"
                                    />
                                )}

                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                    <strong style={{ fontWeight: 700 }}>
                                        {pickedPlace.name}
                                    </strong>
                                </div>

                                {pickedPlace.formatted_address && (
                                    <div style={{ fontSize: 12, marginTop: 6 }}>{pickedPlace.formatted_address}</div>
                                )}
                                {typeof pickedPlace.rating === "number" && (
                                    <div style={{ fontSize: 12, marginTop: 6 }}>
                                        ⭐ {pickedPlace.rating} • {pickedPlace.user_ratings_total || 0} reviews
                                    </div>
                                )}
                            </div>
                        </InfoWindow>
                    )}

                    {/* Nearby result markers */}
                    {results.map((p, idx) => {
                        const pos = p.geometry?.location;
                        if (!pos) return null;
                        return (
                            <AdvancedMarker
                                key={p.place_id || idx}
                                position={pos}
                                onClick={() => {
                                    setPickedPlace(null);    // hide main marker info
                                    setActivePlace(p);       // show this place's info
                                    map?.panTo(pos);
                                    map?.setZoom(Math.max(map.getZoom(), 15));
                                }}
                            >
                                <NearbyPlacePin />
                            </AdvancedMarker>
                        );
                    })}

                    {/* InfoWindow for active nearby place */}
                    {activePlace?.geometry?.location && (
                        <InfoWindow
                            position={activePlace.geometry.location}
                            onCloseClick={() => setActivePlace(null)}
                        >
                            <div style={{ maxWidth: 260 }}>
                                {/* PHOTO */}
                                {getPhotoUrl(activePlace, 360) && (
                                    <img
                                        src={getPhotoUrl(activePlace, 360)}
                                        alt={activePlace.name || "Place photo"}
                                        style={{
                                            width: "100%",
                                            height: 140,
                                            objectFit: "cover",
                                            borderRadius: 8,
                                            marginBottom: 8,
                                        }}
                                        loading="lazy"
                                    />
                                )}

                                <strong>{activePlace.name}</strong>
                                {activePlace.formatted_address && (
                                    <div style={{ fontSize: 12, marginTop: 4 }}>
                                        {activePlace.formatted_address}
                                    </div>
                                )}
                                {typeof activePlace.rating === "number" && (
                                    <div style={{ fontSize: 12, marginTop: 4 }}>
                                        ⭐ {activePlace.rating} • {activePlace.user_ratings_total || 0} reviews
                                    </div>
                                )}
                            </div>
                        </InfoWindow>
                    )}
                </Map>

                {/* Simple results list overlay (optional) */}
                {results.length > 0 && (
                    <div
                        style={{
                            position: "absolute",
                            left: 8,
                            top: 8,
                            width: 320,
                            maxHeight: "60vh",
                            overflowY: "auto",
                            background: "#fff",
                            borderRadius: 8,
                            boxShadow: "0 6px 22px rgba(0,0,0,.15)",
                            padding: 8,
                        }}
                    >
                        {results.map((p, i) => {
                            return (
                                <div
                                    key={p.place_id || i}
                                    onClick={() => {
                                        setPickedPlace(null);
                                        setActivePlace(p);
                                        if (p.geometry?.location && map) {
                                            map.panTo(p.geometry.location); // Pan the map to this place
                                            map.setZoom(16); // Set zoom level for closer view
                                        }
                                    }}
                                    style={{
                                        padding: "8px 10px",
                                        borderBottom: "1px solid #eee",
                                        cursor: "pointer",
                                    }}
                                >
                                    {/* Displaying Place Name */}
                                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                                    {/* Displaying Formatted Address or Vicinity */}
                                    {p.vicinity && (
                                        <div style={{ fontSize: 12, color: "#444" }}>
                                            {p.vicinity}
                                        </div>
                                    )}
                                    {/* Displaying Rating and Total Reviews */}
                                    {typeof p.rating === "number" && (
                                        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                                            ⭐ {p.rating} • {p.user_ratings_total || 0} reviews
                                        </div>
                                    )}
                                    {/* Displaying Plus Code */}
                                    {p.plus_code && (
                                        <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                                            {p.plus_code.compound_code}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

            </div>
        </div>
    );
}