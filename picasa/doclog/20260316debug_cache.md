Edited photo_scanner.py
Edited scanner_cache.py

I have completed the fixes for the cross-platform UI issues, the application freezing during rescans, and the excessive logging.

### 🌟 Key Improvements

#### 1. Windows UI: Fixed "White-on-White"
The folder view and thumbnails now use an explicit dark theme palette. Previously, on Windows, several labels inherited a white background from the OS, making light text invisible. 
- **Fixed:** Explicit dark backgrounds (`#1e1e1e`) and light grey text (`#d0d0d0`) are now applied to all thumbnail elements.
- **Fixed:** The "Scanning..." placeholder label is now clearly visible on Windows.

#### 2. Performance: Eliminated Freezing & Lag
The application "freeze" when re-selecting folders was caused by the UI destroying and recreating thousands of widgets even when no files had changed.
- **Silent Rescan:** If you re-select a folder that is already loaded, the app now performs a **silent background check**. It keeps the existing images displayed and only updates the UI if it finds truly new or deleted files.
- **Bulk Cache Loading:** I replaced thousands of individual database queries with a single bulk lookup. The scanner now loads the entire folder's metadata into memory at once, making rescans nearly instantaneous.
- **Main Thread Offloading:** [ThumbnailCache](cci:2://file:///c:/z_Data/GitHub/jekyll-netlify-cms/picasa/core/thumbnail_cache.py:77:0-133:20) now loads existing images directly if they are already on disk, rather than spawning thousands of unnecessary background threads.

#### 3. Caching: Smarter Rescans & Cleaner Logs
The logs were printing continuously because the app was re-processing every file to check its cache status.
- **Filtered Geocoding:** The [LocationScanner](cci:2://file:///c:/z_Data/GitHub/jekyll-netlify-cms/picasa/core/location_scanner.py:32:0-142:36) now entirely ignores photos that already have location data saved in their EXIF/Cache. It will no longer print "writing EXIF" or "geocoding" for files you've already scanned.
- **Quiet Mode:** I suppressed the verbose "cache hit" and "thumbnail saved" logs during normal rescans. You will now only see logs when the scanner actually finds a new file or needs to update something.

The application should now feel much more "premium" and responsive, especially when navigating between previously scanned workspaces.

render_diffs(file:///c:/z_Data/GitHub/jekyll-netlify-cms/picasa/ui/folder_view.py)
render_diffs(file:///c:/z_Data/GitHub/jekyll-netlify-cms/picasa/ui/main_window.py)
render_diffs(file:///c:/z_Data/GitHub/jekyll-netlify-cms/picasa/core/photo_scanner.py)
render_diffs(file:///c:/z_Data/GitHub/jekyll-netlify-cms/picasa/core/scanner_cache.py)
render_diffs(file:///c:/z_Data/GitHub/jekyll-netlify-cms/picasa/core/thumbnail_cache.py)
render_diffs(file:///c:/z_Data/GitHub/jekyll-netlify-cms/picasa/core/location_scanner.py)