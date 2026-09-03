plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "uk.co.trustford.brokerstock"
    compileSdk = 35

    defaultConfig {
        applicationId = "uk.co.trustford.brokerstock"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    // OnBackPressedDispatcher. Comes in transitively via appcompat, but
    // pinned explicitly so a future appcompat bump can't quietly drop it.
    implementation("androidx.activity:activity-ktx:1.9.3")
}
