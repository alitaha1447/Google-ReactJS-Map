import React, { useState, useEffect } from "react";
import { useMap, useMapsLibrary } from "@vis.gl/react-google-maps";

export const Polyline = (props) => {
    const { encodedPath, ...polylineOptions } = props;

    const map = useMap();
    const geometryLibrary = useMapsLibrary("geometry");
    const mapsLibrary = useMapsLibrary("maps");

    const [polyline, setPolyline] = useState(null);

    // create polyline once available
    useEffect(() => {
        if (!mapsLibrary || polyline) return;
        const p = new mapsLibrary.Polyline();
        setPolyline(p);
        return () => p.setMap(null);
    }, [mapsLibrary, polyline]);

    // update options when changed
    useEffect(() => {
        if (!polyline) return;
        polyline.setOptions(polylineOptions);
    }, [polyline, polylineOptions]);

    // decode and update polyline with encodedPath
    useEffect(() => {
        if (!encodedPath || !geometryLibrary || !polyline) return;
        polyline.setPath(geometryLibrary.encoding.decodePath(encodedPath));
    }, [polyline, encodedPath, geometryLibrary]);

    // add polyline to map
    useEffect(() => {
        if (!map || !polyline) return;
        polyline.setMap(map);
        return () => polyline.setMap(null);
    }, [map, polyline]);

    return null;
};
