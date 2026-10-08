#!/bin/zsh
# ─────────────────────────────────────────────────────────────────────────────
#  Slideshower · pubblicazione di una nuova versione (doppio clic per avviare)
#
#  1. chiede il numero della nuova versione
#  2. compila Mac (Apple Silicon + Intel), Windows e Android
#  3. salva il codice su GitHub (aggiorna anche la web app su GitHub Pages)
#  4. cancella le release vecchie e pubblica quella nuova con i 4 pacchetti
#
#  Uso da terminale senza domande:  ./rilascia.command 1.2.0
# ─────────────────────────────────────────────────────────────────────────────
set -e
set -o pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

INTERACTIVE=1; [[ -n "$1" ]] && INTERACTIVE=0
bold() { print -P "%B$1%b"; }
step() { print; print -P "%F{magenta}━━ $1%f"; }
finish() {
  local code=$?
  print
  if (( code == 0 )); then print -P "%F{green}✔ Fatto.%f"; else print -P "%F{red}✘ Interrotto: guarda l'errore qui sopra. Nessuna release è stata modificata se l'errore è avvenuto durante la compilazione.%f"; fi
  if (( INTERACTIVE )); then print; read -k 1 "?Premi un tasto per chiudere…"; fi
}
trap finish EXIT

# ── controlli iniziali
for tool in node npm git gh; do
  command -v $tool >/dev/null || { print -P "%F{red}Manca '$tool'. Installalo e riprova.%f"; exit 1; }
done
gh auth status >/dev/null 2>&1 || { print -P "%F{red}Non hai effettuato l'accesso a GitHub: esegui 'gh auth login'.%f"; exit 1; }
REPO=$(sed -n "s/.*APP_REPO = '\(.*\)'.*/\1/p" app/js/version.js)
[[ -n "$REPO" ]] || { print "Repository non trovato in app/js/version.js"; exit 1; }

# Java per Android: usa quello incluso in Android Studio, se presente
JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
[[ -d "$JBR" ]] && export JAVA_HOME="$JBR"

# ── versione
CURRENT=$(node -p "require('./package.json').version")
SUGGESTED=$(node -p "const v='$CURRENT'.split('.').map(Number); v[2]++; v.join('.')")
bold "Slideshower · nuova pubblicazione su github.com/$REPO"
print "Versione attuale: $CURRENT"
if (( INTERACTIVE )); then
  read "VERSION?Nuova versione [$SUGGESTED]: "
  VERSION=${VERSION:-$SUGGESTED}
else
  VERSION=$1
fi
VERSION=${VERSION#v}
[[ "$VERSION" =~ '^[0-9]+\.[0-9]+\.[0-9]+$' ]] || { print -P "%F{red}Versione non valida: usa il formato 1.2.3%f"; exit 1; }
if (( INTERACTIVE )); then
  read "NOTES?Novità di questa versione (facoltativo): "
  read "OK?Pubblico la versione $VERSION e cancello le release precedenti? [s/N] "
  [[ "$OK" == [sSyY]* ]] || { print "Annullato."; exit 1; }
fi
NOTES=${NOTES:-"Slideshower $VERSION"}

step "Aggiorno il numero di versione"
npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null
sed -i '' "s/APP_VERSION = '.*'/APP_VERSION = '$VERSION'/" app/js/version.js
CODE=$(node -p "const [a,b,c]='$VERSION'.split('.').map(Number); a*10000+b*100+c")
sed -i '' -E "s/versionCode [0-9]+/versionCode $CODE/; s/versionName \"[^\"]*\"/versionName \"$VERSION\"/" android/app/build.gradle
print "→ $VERSION (codice Android $CODE)"

[[ -d node_modules ]] || { step "Installo le dipendenze"; npm install; }

step "Compilo Mac e Windows"
rm -rf dist
npx electron-builder --mac --win

step "Compilo Android"
npx cap sync android
(cd android && ./gradlew assembleDebug -q)
cp android/app/build/outputs/apk/debug/app-debug.apk dist/Slideshower-android.apk

FILES=(dist/Slideshower-mac-arm64.dmg dist/Slideshower-mac-x64.dmg dist/Slideshower-windows.zip dist/Slideshower-android.apk)
for f in $FILES; do [[ -s "$f" ]] || { print -P "%F{red}Pacchetto mancante: $f%f"; exit 1; }; done
ls -lh $FILES | awk '{print "  " $5 "  " $9}'

step "Salvo il codice su GitHub"
git add -A
git diff --cached --quiet || git commit -q -m "Versione $VERSION"
git push -q origin HEAD:main

step "Cancello le release precedenti"
for tag in $(gh release list --repo "$REPO" --limit 100 --json tagName -q '.[].tagName'); do
  print "  elimino $tag"
  gh release delete "$tag" --repo "$REPO" --yes --cleanup-tag
done

step "Pubblico la versione $VERSION"
gh release create "v$VERSION" $FILES --repo "$REPO" --target main --title "Slideshower $VERSION" --notes "$NOTES" --latest
print
bold "Pubblicata: https://github.com/$REPO/releases/latest"
(( INTERACTIVE )) && open "https://github.com/$REPO/releases/latest"
exit 0
