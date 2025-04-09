from flask import Flask, request, jsonify
import geopandas as gpd
import json

app = Flask(__name__)

# Path to your processed GeoJSON file (update the path as needed)
GEOJSON_PATH = '6.C85_project/analysis/raw_data/housing_sf_other_w_census.geojson'

# Load the GeoJSON data once at startup
gdf = gpd.read_file(GEOJSON_PATH)

def filter_by_municipality(gdf, municipality_filter):
    """
    Filter the GeoDataFrame by municipality.
    If municipality_filter is not "All Municipalities", only features whose 
    'muni' field (case-insensitive) matches the filter are retained.
    """
    filtered = gdf.copy()
    if municipality_filter.lower() != "all municipalities":
        filtered = filtered[filtered['muni'].str.lower() == municipality_filter.lower()]
    return filtered

@app.route('/api/housing', methods=['GET'])
def get_housing_data():
    """
    API endpoint to fetch housing data, filtered by municipality.
    Expected query parameter:
      - municipality: e.g., "Boston", "Cambridge", or "All Municipalities"
    """
    municipality_filter = request.args.get('municipality', default="All Municipalities")
    filtered_gdf = filter_by_municipality(gdf, municipality_filter)
    # Convert the filtered GeoDataFrame to GeoJSON format
    filtered_geojson = json.loads(filtered_gdf.to_json())
    return jsonify(filtered_geojson)

if __name__ == '__main__':
    app.run(debug=True)