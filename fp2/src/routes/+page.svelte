<script>
    import { onMount } from 'svelte';
    import mapboxgl from 'mapbox-gl';
  
    let map;
    const MAPBOX_TOKEN = 'pk.eyJ1Ijoic3N1byIsImEiOiJjbTk5Z2NnNWIwNDh5MnJwdjFwZGhnZmU2In0.DlLRt3C3qdBGprZR4SvRVQ'; 
  
    onMount(async () => {
      mapboxgl.accessToken = MAPBOX_TOKEN;
  
      map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-71.0589, 42.3601],
        zoom: 9
      });
  
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  
      map.on('load', async () => {
        const geojson = await fetch('/housing_sf_other_w_census.geojson').then(res => res.json());
  
        map.addSource('zoning', {
          type: 'geojson',
          data: geojson
        });
  
        map.addLayer({
          id: 'zoning-fill',
          type: 'fill',
          source: 'zoning',
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'only_single_family'], 1],
              '#e07a5f', // single-family (warm coral)
              '#81b29a'  // multi-family (sage green)
            ],
            'fill-opacity': 0.7
          }
        });
  
        map.addLayer({
          id: 'zoning-outline',
          type: 'line',
          source: 'zoning',
          paint: {
            'line-color': '#ffffff',
            'line-width': 1
          }
        });
  
        map.on('mouseenter', 'zoning-fill', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const muni = e.features[0].properties.muni;
          const percent = e.features[0].properties['%_single_family'];
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`<strong>${muni}</strong><br>${percent}% single-family`)
            .addTo(map);
        });
  
        map.on('mouseleave', 'zoning-fill', () => {
          map.getCanvas().style.cursor = '';
        });
      });
    });
  </script>
  
  <!-- Page Layout (same as before) -->
  <div class="page">
    <section class="intro">
      <h1>Explore Housing Access in Greater Boston</h1>
      <p>
        Use our interactive zoning map to understand how policies shape affordability—
        and discover where you might call home.
      </p>
    </section>
  
    <section class="map-section">
      <div class="map-and-filters">
        <div class="map-container">
          <div id="map"></div>
        </div>
  
        <div class="filter-box">
          <h2>Map Filters</h2>
          <label>
            Income Level
            <select>
              <option>All Income Levels</option>
              <option>Under $25K</option>
              <option>$25K - $50K</option>
              <option>$50K - $75K</option>
              <option>$75K - $100K</option>
              <option>$100K - $150K</option>
              <option>$150K & above</option>
            </select>
          </label>
  
          <label>
            Family Size
            <select>
              <option>All Family Sizes</option>
              <option>1-person</option>
              <option>2-person</option>
              <option>3-person</option>
              <option>4-person</option>
              <option>5-person</option>
              <option>6-person</option>
              <option>7+ persons</option>
            </select>
          </label>
  
          <label>
            Municipality
            <select>
              <option>All Municipalities</option>
              <option>Boston</option>
              <option>Cambridge</option>
              <option>Somerville</option>
              <!-- Add more as needed -->
            </select>
          </label>
  
          <label>
            Years to Save
            <input type="range" min="1" max="10" value="5">
            <small>Assumes saving 30% of income annually</small>
          </label>
        </div>
      </div>
    </section>
  
    <section class="stats">
      <div class="stat">
        <p>🏘️ Single-Family Zoning</p>
        <h3>65%</h3>
        <small>of residential land</small>
      </div>
      <div class="stat">
        <p>🏢 Multi-Family Zoning</p>
        <h3>35%</h3>
        <small>of residential land</small>
      </div>
      <div class="stat">
        <p>👥 Population Density</p>
        <h3>13,841</h3>
        <small>people per sq. mile</small>
      </div>
    </section>
  
    <section class="conclusion">
      <h2>Why Zoning Reform Matters</h2>
      <p>
        With 65% of Greater Boston zoned for single-family homes,
        multi-family and affordable options are scarce.
        Zoning reform can help build a more inclusive and equitable housing future.
      </p>
    </section>
  </div>
  
  <style>
    @import 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
  
    .page {
      font-family: sans-serif;
      background: #f6f0e8;
      color: #3e3e3e;
      margin: 0;
      padding: 0;
    }
  
    .intro {
      background: #d8a59c;
      padding: 3rem 1rem;
      text-align: center;
      color: white;
    }
  
    .intro h1 {
      font-size: 2.5rem;
      margin-bottom: 1rem;
    }
  
    .intro p {
      max-width: 600px;
      margin: 0 auto;
      font-size: 1.2rem;
    }
  
    .map-section {
      padding: 2rem 1rem;
      background: white;
    }
  
    .map-and-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 2rem;
      justify-content: center;
    }
  
    .map-container {
      background: #d6c7b3;
      width: 900px;
      height: 600px;
      border-radius: 10px;
      overflow: hidden;
    }
  
    #map {
      width: 100%;
      height: 100%;
    }
  
    .filter-box {
      background: white;
      padding: 1rem;
      border: 1px solid #ccc;
      border-radius: 8px;
      width: 260px;
    }
  
    .filter-box h2 {
      font-size: 1.2rem;
      margin-bottom: 1rem;
    }
  
    .filter-box label {
      display: block;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }
  
    .filter-box select,
    .filter-box input[type="range"] {
      width: 100%;
      margin-top: 0.25rem;
    }
  
    .stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      padding: 3rem 1rem;
    }
  
    .stat {
      background: #eac7b1;
      padding: 1rem;
      border-radius: 8px;
      width: 200px;
      text-align: center;
    }
  
    .stat:nth-child(2) {
      background: #f1e1c5;
    }
  
    .stat:nth-child(3) {
      background: #d8a59c;
      color: white;
    }
  
    .stat h3 {
      font-size: 2rem;
      margin: 0.5rem 0;
    }
  
    .conclusion {
      background: #bfa9a0;
      color: white;
      text-align: center;
      padding: 3rem 1rem;
    }
  
    .conclusion h2 {
      font-size: 1.8rem;
      margin-bottom: 1rem;
    }
  
    .conclusion p {
      max-width: 700px;
      margin: 0 auto;
      font-size: 1.1rem;
    }
  </style>
  