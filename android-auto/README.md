# LifeOS Drive — Android Auto (versão de teste)

App Android nativa (Kotlin + Car App Library) que mostra os alertas da LifeOS
(Conduzir) no ecrã do carro. **Versão de teste**: instalação por side-load
(não passa pelo Google Play) e usa um host validator permissivo.

## O que faz

- A cada 30 s consulta `GET <BASE_URL>/api/waze?mode=around&lat=..&lon=..&radius=2000`
  com `Authorization: Bearer <chave>` e mostra a lista de alertas (polícia,
  radares, acidentes, perigos, trânsito) ordenada por distância.
- Tocar num alerta abre a navegação no **Waze** até ao ponto (`waze.com/ul`).
- Usa a última localização conhecida do telemóvel (GPS/network).

## Configuração (1 minuto)

1. Abre a LifeOS → **Definições → Integrações → Automações → Gerar chave** e copia a chave.
2. Edita `app/src/main/java/com/lifeos/drive/Config.kt`:
   ```kotlin
   const val BASE_URL = "https://<o-teu-dominio>"   // ex.: https://lifeos-eosin-phi.vercel.app
   const val API_KEY = "<chave da LifeOS>"
   ```

## Compilar

```bash
# dentro de android-auto/
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Precisas de JDK 17+ e Android SDK (compileSdk 36). No Android Studio:
*File → Open* esta pasta e *Run* num telemóvel ligado (ou *Build APK*).

## Instalar no Android Auto (side-load)

A Google só mostra apps do Play Store no Android Auto; para testar esta app:

1. **Ativa o modo de programador no Android Auto** (no carro ou no telefone com
   a app Android Auto): Definições → toca 10× na versão → ativa "Fontes desconhecidas".
2. Instala o **[AAAD](https://github.com/shmykelsa/AAAD)** (Android Auto Apps
   Downloader) no telemóvel, instala o `app-debug.apk` e adiciona a app ao AAAD.
3. Liga o telemóvel ao carro → Android Auto → a app aparece como **LifeOS Drive**.
   (Alternativa: `adb install app-debug.apk` + modo dev do Android Auto.)

> Nota: o Google tem vindo a apertar o side-load — se deixar de funcionar numa
> atualização do Android Auto, é esperado; a versão Play exigiria aprovação como
> app de navegação (apenas para apps completas de navegação).

## Limitações da versão de teste

- `HostValidator.ALLOW_ALL_HOSTS_VALIDATOR` — para distribuição real troca por
  validação de hosts (ver [documentação](https://developer.android.com/training/cars/apps#host-validator)).
- Sem navegação passo-a-passo: só a lista de alertas (a categoria NAVIGATION é
  usada para a app aparecer na gaveta de navegação; não faz turn-by-turn).
- Strings fixas em PT.
