package com.flaviocecca.slideshower;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.DocumentsContract.Document;
import android.view.Window;
import android.view.WindowManager;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Funzioni native di Slideshower: scelta della cartella (Storage Access Framework),
 * elenco di foto e video, schermo acceso, modalità immersiva e tasto indietro.
 */
@CapacitorPlugin(name = "Slideshower")
public class SlideshowerPlugin extends Plugin {

    // Formati che la WebView di sistema sa mostrare.
    private static final Set<String> IMAGE_EXT = new HashSet<>(
        Arrays.asList("jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "jfif")
    );
    private static final Set<String> VIDEO_EXT = new HashSet<>(Arrays.asList("mp4", "m4v", "mov", "webm", "mkv", "ogv", "3gp"));

    @Override
    public void load() {
        // Il tasto indietro viene gestito dall'interfaccia (chiude pannello → player → app).
        getActivity()
            .getOnBackPressedDispatcher()
            .addCallback(
                getActivity(),
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        bridge.triggerWindowJSEvent("slideshowerBack");
                    }
                }
            );
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "onFolderPicked");
    }

    @ActivityCallback
    private void onFolderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri tree = data.getData();
        try {
            // Mantiene l'accesso anche dopo il riavvio, per le cartelle recenti.
            getContext().getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {}
        JSObject ret = new JSObject();
        ret.put("uri", tree.toString());
        ret.put("name", folderName(tree));
        call.resolve(ret);
    }

    @PluginMethod
    public void listMedia(PluginCall call) {
        String uriString = call.getString("uri");
        boolean recursive = Boolean.TRUE.equals(call.getBoolean("recursive", true));
        if (uriString == null) {
            call.reject("uri mancante");
            return;
        }
        Uri tree = Uri.parse(uriString);
        ContentResolver resolver = getContext().getContentResolver();
        JSArray items = new JSArray();
        String[] columns = { Document.COLUMN_DOCUMENT_ID, Document.COLUMN_DISPLAY_NAME, Document.COLUMN_MIME_TYPE, Document.COLUMN_LAST_MODIFIED };

        ArrayDeque<String[]> queue = new ArrayDeque<>(); // { documentId, percorso relativo }
        try {
            queue.add(new String[] { DocumentsContract.getTreeDocumentId(tree), "" });
            boolean first = true;
            while (!queue.isEmpty()) {
                String[] dir = queue.poll();
                Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, dir[0]);
                try (Cursor c = resolver.query(children, columns, null, null, null)) {
                    if (c == null) {
                        if (first) throw new SecurityException("cartella non accessibile");
                        continue;
                    }
                    while (c.moveToNext()) {
                        String id = c.getString(0);
                        String name = c.getString(1);
                        String mime = c.getString(2);
                        if (name == null || name.startsWith(".")) continue;
                        String rel = dir[1].isEmpty() ? name : dir[1] + "/" + name;
                        if (Document.MIME_TYPE_DIR.equals(mime)) {
                            if (recursive) queue.add(new String[] { id, rel });
                            continue;
                        }
                        String type = mediaType(name);
                        if (type == null) continue;
                        JSObject item = new JSObject();
                        item.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                        item.put("name", name);
                        item.put("rel", rel);
                        item.put("mtime", c.isNull(3) ? 0 : c.getLong(3));
                        item.put("type", type);
                        items.put(item);
                    }
                }
                first = false;
            }
        } catch (Exception e) {
            call.reject("Impossibile leggere la cartella", e);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("name", folderName(tree));
        ret.put("items", items);
        call.resolve(ret);
    }

    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity()
            .runOnUiThread(() -> {
                Window w = getActivity().getWindow();
                if (on) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                call.resolve();
            });
    }

    @PluginMethod
    public void setImmersive(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity()
            .runOnUiThread(() -> {
                Window w = getActivity().getWindow();
                WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
                c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                if (on) c.hide(WindowInsetsCompat.Type.systemBars());
                else c.show(WindowInsetsCompat.Type.systemBars());
                call.resolve();
            });
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> getActivity().moveTaskToBack(true));
    }

    // Gli aggiornamenti si scaricano solo dalle release del repository ufficiale.
    private static final String UPDATE_PREFIX = "https://github.com/carellice/slideshower/releases/download/";

    @PluginMethod
    public void installUpdate(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !url.startsWith(UPDATE_PREFIX)) {
            call.reject("Indirizzo non consentito");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("cartella non creata");
                File apk = new File(dir, "Slideshower-update.apk");
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                if (conn.getResponseCode() != 200) throw new Exception("HTTP " + conn.getResponseCode());
                long total = conn.getContentLengthLong();
                long done = 0, lastSent = 0;
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        long now = System.currentTimeMillis();
                        if (total > 0 && now - lastSent > 150) {
                            lastSent = now;
                            bridge.triggerWindowJSEvent("slideshowerProgress", "{\"percent\":" + ((double) done / total) + "}");
                        }
                    }
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                call.resolve();
            } catch (Exception e) {
                call.reject("Aggiornamento non riuscito", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        })
            .start();
    }

    private static String mediaType(String name) {
        int dot = name.lastIndexOf('.');
        if (dot < 0) return null;
        String ext = name.substring(dot + 1).toLowerCase(Locale.ROOT);
        if (IMAGE_EXT.contains(ext)) return "image";
        if (VIDEO_EXT.contains(ext)) return "video";
        return null;
    }

    private String folderName(Uri tree) {
        try {
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            try (Cursor c = getContext().getContentResolver().query(doc, new String[] { Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst() && c.getString(0) != null) return c.getString(0);
            }
        } catch (Exception ignored) {}
        String last = tree.getLastPathSegment();
        if (last == null) return "Cartella";
        int cut = Math.max(last.lastIndexOf('/'), last.lastIndexOf(':'));
        return cut >= 0 && cut < last.length() - 1 ? last.substring(cut + 1) : last;
    }
}
