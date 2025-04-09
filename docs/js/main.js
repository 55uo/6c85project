document.addEventListener("DOMContentLoaded", function () {
  const width = 900,
    height = 600;

  // Create an SVG element in the #map container.
  const svg = d3
    .select("#map")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Define a geographic projection centered on Boston.
  const projection = d3
    .geoMercator()
    .center([-71.0589, 42.3601]) // Coordinates of Boston.
    .scale(50000)
    .translate([width / 2, height / 2]);
  const path = d3.geoPath().projection(projection);

  // Function to fetch filtered data based on municipality.
  function fetchFilteredData() {
    const municipalityFilter =
      document.getElementById("municipalityFilter").value;
    const queryUrl = `/api/housing?municipality=${encodeURIComponent(
      municipalityFilter
    )}`;

    d3.json(queryUrl)
      .then((geojsonData) => {
        updateMap(geojsonData);
      })
      .catch((error) => {
        console.error("Error fetching data:", error);
      });
  }

  // Function to update the map using the fetched GeoJSON data.
  function updateMap(geojsonData) {
    // Remove any existing paths.
    svg.selectAll("path").remove();

    // Append new paths.
    svg
      .selectAll("path")
      .data(geojsonData.features)
      .enter()
      .append("path")
      .attr("d", path)
      .attr("fill", (d) => {
        // Color example: if the feature is exclusively single-family (only_single_family === 1)
        return d.properties.only_single_family === 1 ? "#a6cee3" : "#1f78b4";
      })
      .attr("stroke", "#fff")
      .on("mouseover", function (event, d) {
        // Update a tooltip element (assumes an element with id "tooltip1" exists)
        d3.select("#tooltip1 span").text(
          `${d.properties.muni}: ${d.properties["%_single_family"]}% single-family zoned`
        );
      });
  }

  // Attach event listener to the municipality filter select element.
  document
    .getElementById("municipalityFilter")
    .addEventListener("change", fetchFilteredData);

  // Load the initial map view.
  fetchFilteredData();
});
