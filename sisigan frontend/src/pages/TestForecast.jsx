import React, { useEffect, useState } from "react";

export default function TestForecast() {
  const [data, setData] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/data/forecast_output.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to load forecast_output.json");
        }
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Forecast JSON Test</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <pre>{JSON.stringify(data.slice(0, 2), null, 2)}</pre>
    </div>
  );
}