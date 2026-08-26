package com.atelier.commandes;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Enveloppe Android de l'application Atelier : une WebView servie depuis
 * les assets (origine sécurisée, IndexedDB persistant), avec la caméra,
 * les liens externes (WhatsApp, téléphone) et l'export de sauvegarde
 * délégués au système.
 */
public class MainActivity extends Activity {

    private WebView vueFacture;

    private static final String HOTE_LOCAL = "appassets.androidplatform.net";
    private static final String PAGE_ACCUEIL = "https://" + HOTE_LOCAL + "/assets/www/index.html";
    private static final int REQ_FICHIERS = 1;
    private static final int REQ_EXPORT = 2;

    private WebView vueWeb;
    private ValueCallback<Uri[]> rappelFichiers;
    private Uri photoEnAttente;
    private byte[] exportEnAttente;

    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);
        vueWeb = new WebView(this);
        setContentView(vueWeb);

        WebSettings reglages = vueWeb.getSettings();
        reglages.setJavaScriptEnabled(true);
        reglages.setDomStorageEnabled(true);

        final WebViewAssetLoader chargeur = new WebViewAssetLoader.Builder()
                .setDomain(HOTE_LOCAL)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        vueWeb.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView vue, WebResourceRequest requete) {
                return chargeur.shouldInterceptRequest(requete.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView vue, WebResourceRequest requete) {
                Uri url = requete.getUrl();
                if (HOTE_LOCAL.equals(url.getHost())) return false;
                ouvrirDansSysteme(url);
                return true;
            }
        });

        vueWeb.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView vue, ValueCallback<Uri[]> rappel,
                                             FileChooserParams parametres) {
                if (rappelFichiers != null) rappelFichiers.onReceiveValue(null);
                rappelFichiers = rappel;
                ouvrirChoixPhoto();
                return true;
            }
        });

        vueWeb.addJavascriptInterface(new PontAtelier(), "AndroidAtelier");
        vueWeb.loadUrl(PAGE_ACCUEIL);
    }

    /** Propose l'appareil photo en premier, la galerie en secours. */
    private void ouvrirChoixPhoto() {
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        photoEnAttente = FileProvider.getUriForFile(this,
                getPackageName() + ".fileprovider",
                new File(getCacheDir(), "tissu_" + System.currentTimeMillis() + ".jpg"));
        camera.putExtra(MediaStore.EXTRA_OUTPUT, photoEnAttente);
        camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

        // Certains appareils exigent une autorisation explicite par application.
        List<ResolveInfo> cameras = getPackageManager().queryIntentActivities(camera, 0);
        for (ResolveInfo info : cameras) {
            grantUriPermission(info.activityInfo.packageName, photoEnAttente,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        }

        Intent galerie = new Intent(Intent.ACTION_GET_CONTENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("image/*")
                .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

        Intent choix = Intent.createChooser(galerie, "Photo du tissu");
        if (!cameras.isEmpty()) {
            choix.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        }
        try {
            startActivityForResult(choix, REQ_FICHIERS);
        } catch (ActivityNotFoundException e) {
            rappelFichiers.onReceiveValue(null);
            rappelFichiers = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int resultat, Intent donnees) {
        super.onActivityResult(code, resultat, donnees);

        if (code == REQ_FICHIERS) {
            Uri[] fichiers = null;
            if (resultat == RESULT_OK) {
                if (donnees != null && donnees.getClipData() != null) {
                    ArrayList<Uri> liste = new ArrayList<>();
                    for (int i = 0; i < donnees.getClipData().getItemCount(); i++) {
                        liste.add(donnees.getClipData().getItemAt(i).getUri());
                    }
                    fichiers = liste.toArray(new Uri[0]);
                } else if (donnees != null && donnees.getData() != null) {
                    fichiers = new Uri[]{donnees.getData()};
                } else if (photoEnAttente != null) {
                    fichiers = new Uri[]{photoEnAttente}; // photo prise à la caméra
                }
            }
            if (rappelFichiers != null) rappelFichiers.onReceiveValue(fichiers);
            rappelFichiers = null;
            photoEnAttente = null;

        } else if (code == REQ_EXPORT) {
            if (resultat == RESULT_OK && donnees != null && donnees.getData() != null
                    && exportEnAttente != null) {
                try (OutputStream sortie = getContentResolver().openOutputStream(donnees.getData())) {
                    if (sortie == null) throw new IllegalStateException("flux nul");
                    sortie.write(exportEnAttente);
                    Toast.makeText(this, "Sauvegarde enregistrée", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(this, "Enregistrement impossible", Toast.LENGTH_SHORT).show();
                }
            }
            exportEnAttente = null;
        }
    }

    private void ouvrirDansSysteme(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Aucune application pour ouvrir ce lien", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (vueWeb.canGoBack()) vueWeb.goBack();
        else super.onBackPressed();
    }

    /** Fonctions exposées à la page sous window.AndroidAtelier. */
    private class PontAtelier {

        @JavascriptInterface
        public void ouvrirLien(final String url) {
            runOnUiThread(() -> ouvrirDansSysteme(Uri.parse(url)));
        }

        /** Facture A4 : passe par le service d'impression Android,
            qui propose « Enregistrer au format PDF ». */
        @JavascriptInterface
        public void imprimer(final String nom, final String html) {
            runOnUiThread(() -> {
                final WebView vueImpression = new WebView(MainActivity.this);
                vueImpression.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView vue, String url) {
                        PrintManager service = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        if (service == null) {
                            Toast.makeText(MainActivity.this,
                                    "Impression non disponible sur cet appareil", Toast.LENGTH_SHORT).show();
                            return;
                        }
                        PrintDocumentAdapter adaptateur = vue.createPrintDocumentAdapter(nom);
                        service.print(nom, adaptateur, new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build());
                    }
                });
                vueImpression.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                // Référence gardée le temps de l'impression : sinon la vue est
                // ramassée par le garbage collector avant la génération du PDF.
                vueFacture = vueImpression;
            });
        }

        @JavascriptInterface
        public void enregistrerFichier(final String nom, final String contenu) {
            exportEnAttente = contenu.getBytes(StandardCharsets.UTF_8);
            final Intent intention = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/json")
                    .putExtra(Intent.EXTRA_TITLE, nom);
            runOnUiThread(() -> {
                try {
                    startActivityForResult(intention, REQ_EXPORT);
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this,
                            "Enregistrement non disponible sur cet appareil", Toast.LENGTH_SHORT).show();
                }
            });
        }
    }
}
