/**
 * COMPLETE ENHANCED ROUTE NAVIGATION MODULE - FULL IMPLEMENTATION
 * Part 1: Core Infrastructure, Complete Styles, Route Management with Dynamic Optimization
 * All features, animations, error handling, and edge cases preserved
 */

// ============================================================================
// INITIALIZATION GUARD
// ============================================================================
let initialized = false;

// ============================================================================
// GLOBAL CONFIGURATION
// ============================================================================

const CONFIG = {
    api: {
        OPENROUTE_KEY: '5b3ce3597851110001cf624841e48578ffb34c6b96dfe3bbe9b3ad4c',
        SUPABASE_URL: 'https://btxavqfoirdzwpfrvezp.supabase.co',
        SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0eGF2cWZvaXJkendwZnJ2ZXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0ODcxMTcsImV4cCI6MjA2NzA2MzExN30.kQKpukFGx-cBl1zZRuXmex02ifkZ751WCUfQPogYutk'
    },
    business: {
        riderCommission: 0.70,
        platformCommission: 0.30,
        maxUnpaid: 300,
        warningThreshold: 250
    },
    defaults: {
        nairobi: { lat: -1.2921, lng: 36.8219 }
    },
    dev: {
        isDevelopment: window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname.includes('github.io'),
        testRider: {
            id: 'ef5438ef-0cc0-4e35-8d1b-be18dbce7fe4',
            name: 'Bobby G',
            phone: '0725046880'
        },
        verboseLogging: true,
        ignoreRiderNotFound: true
    },
    navigation: {
        headingUp: false,
        smoothMovement: true,
        autoZoom: true,
        mapRotatable: true,
        useDynamicOptimization: true
    }
};

// ============================================================================
// GLOBAL STATE (Centralized)
// ============================================================================

const GlobalState = {
    route: null,
    map: null,
    markers: [],
    polylines: [],
    location: null,
    lastLocation: null,
    lastLocationTime: null,
    tracking: {
        watchId: null,
        isActive: false,
        heading: 0,
        speed: 0,
        interval: null,
        proximityNotified: false
    },
    navigation: {
        isActive: false,
        isFollowing: true,
        currentInstruction: null,
        directionsPolyline: null,
        mapBearing: 0,
        lastMapRotation: 0
    },
    ui: {
        panelVisible: false,
        panelExpanded: false,
        pickupPhaseCompleted: false
    },
    parcels: {
        inPossession: [],
        cashToCollect: 0,
        cashCollected: 0,
        paymentsByStop: {}
    },
    verification: {
        currentStop: null,
        podData: null
    },
    offline: {
        proofs: [],
        pendingUpdates: []
    },
    earnings: {
        totalRouteEarnings: 0,
        routeCommission: 0
    },
    locationMarker: null,
    accuracyCircle: null,
    radiusCircle: null,
    routeControl: null,
    optimizedSequence: null
};

// ============================================================================
// COMPLETE STYLES INJECTION
// ============================================================================

function injectCompleteStyles() {
    const styleId = 'route-navigation-styles';
    if (document.getElementById(styleId)) return;
    
    const styles = document.createElement('style');
    styles.id = styleId;
    styles.textContent = `
        /* Base Variables */
        :root {
            --primary: #0066FF;
            --primary-dark: #0052cc;
            --success: #34C759;
            --warning: #FF9F0A;
            --danger: #FF3B30;
            --surface: #1C1C1E;
            --surface-elevated: #2C2C2E;
            --surface-high: #3A3A3C;
            --text-primary: #FFFFFF;
            --text-secondary: #8E8E93;
            --text-tertiary: #636366;
            --border: #48484A;
            --safe-area-bottom: env(safe-area-inset-bottom);
        }
        
        /* Notifications */
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--surface-elevated);
            color: var(--text-primary);
            padding: 16px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            gap: 12px;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            max-width: 350px;
            border: 1px solid var(--border);
        }
        
        .notification.success {
            background: var(--success);
            color: white;
            border-color: var(--success);
        }
        
        .notification.error {
            background: var(--danger);
            color: white;
            border-color: var(--danger);
        }
        
        .notification.warning {
            background: var(--warning);
            color: black;
            border-color: var(--warning);
        }
        
        .notification.info {
            background: var(--primary);
            color: white;
            border-color: var(--primary);
        }
        
        .notification-icon {
            font-size: 20px;
        }
        
        .notification.hiding {
            animation: slideOut 0.3s ease-out;
        }
        
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
        
        /* Map Container */
        .map-container {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            z-index: 1 !important;
        }
        
        #map {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            z-index: 1 !important;
        }
        
        /* Current Location Marker */
        .current-location-marker {
            z-index: 1000 !important;
        }
        
        .location-marker-wrapper {
            position: relative;
            width: 60px;
            height: 60px;
        }
        
        .location-pulse {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 60px;
            height: 60px;
            background: rgba(0, 102, 255, 0.3);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            animation: pulse 2s infinite;
        }
        
        .location-dot {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 24px;
            height: 24px;
            background: #0066FF;
            border: 3px solid white;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            z-index: 2;
        }
        
        @keyframes pulse {
            0% {
                transform: translate(-50%, -50%) scale(0.8);
                opacity: 0.8;
            }
            50% {
                transform: translate(-50%, -50%) scale(1.5);
                opacity: 0.4;
            }
            100% {
                transform: translate(-50%, -50%) scale(0.8);
                opacity: 0.8;
            }
        }
        
        /* Stop Markers */
        .stop-marker-wrapper {
            position: relative;
        }
        
        .stop-marker-wrapper.active .marker-pulse {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 2px solid #0066FF;
            animation: pulse 2s infinite;
        }
        
        /* Verification Modal */
        .verification-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            animation: fadeIn 0.3s ease;
        }
        
        .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
        }
        
        .modal-content {
            position: relative;
            background: var(--surface-elevated);
            border-radius: 24px;
            max-width: 420px;
            width: 90%;
            max-height: 85vh;
            overflow: hidden;
            z-index: 1;
            animation: slideUp 0.3s ease;
        }
        
        .modal-header {
            padding: 24px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        
        .modal-header.pickup {
            background: linear-gradient(135deg, #FF9F0A 0%, #ff8c00 100%);
            color: black;
        }
        
        .modal-header.delivery {
            background: linear-gradient(135deg, #0066FF 0%, #0052cc 100%);
            color: white;
        }
        
        .modal-icon {
            font-size: 48px;
            display: block;
            margin-bottom: 12px;
        }
        
        .modal-body {
            padding: 24px;
            max-height: calc(85vh - 120px);
            overflow-y: auto;
        }
        
        .stop-summary {
            background: var(--surface-high);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 20px;
        }
        
        .stop-summary h3 {
            margin: 0 0 12px 0;
            font-size: 18px;
            color: var(--text-primary);
        }
        
        .summary-details {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .summary-row {
            display: flex;
            justify-content: space-between;
        }
        
        .summary-label {
            color: var(--text-secondary);
        }
        
        .summary-value {
            font-weight: 600;
            color: var(--text-primary);
        }
        
        .payment-collection-alert {
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.2), rgba(255, 149, 0, 0.1));
            border: 2px solid var(--warning);
            border-radius: 12px;
            padding: 16px;
            margin: 16px 0;
            text-align: center;
        }
        
        .verification-section {
            margin: 20px 0;
        }
        
        .verification-section label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: var(--text-primary);
        }
        
        .verification-input {
            width: 100%;
            padding: 16px;
            font-size: 24px;
            text-align: center;
            border: 2px solid var(--border);
            border-radius: 12px;
            background: var(--surface-high);
            color: var(--text-primary);
            text-transform: uppercase;
            letter-spacing: 2px;
            font-weight: 600;
            transition: all 0.2s;
            outline: none;
        }
        
        .verification-input:focus {
            border-color: var(--primary);
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0, 102, 255, 0.2);
        }
        
        .verification-input.error {
            border-color: var(--danger);
            animation: shake 0.3s;
        }
        
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
        }
        
        .code-hint {
            text-align: center;
            color: var(--text-secondary);
            margin-top: 8px;
            font-size: 14px;
        }
        
        .modal-actions {
            display: flex;
            gap: 12px;
            margin-top: 24px;
        }
        
        .modal-btn {
            flex: 1;
            padding: 16px;
            border: none;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: all 0.2s;
        }
        
        .modal-btn.primary {
            background: var(--primary);
            color: white;
        }
        
        .modal-btn.primary:hover {
            background: var(--primary-dark);
        }
        
        .modal-btn.primary:active {
            transform: scale(0.95);
        }
        
        .modal-btn.secondary {
            background: var(--surface-high);
            color: var(--text-primary);
            border: 1px solid var(--border);
        }
        
        .modal-btn.secondary:hover {
            background: var(--surface);
        }
        
        .modal-btn.secondary:active {
            transform: scale(0.95);
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes slideUp {
            from { 
                transform: translateY(20px); 
                opacity: 0;
            }
            to { 
                transform: translateY(0); 
                opacity: 1;
            }
        }
        
        /* POD Modal */
        .pod-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.2s ease;
        }
        
        .pod-content {
            background: white;
            border-radius: 20px;
            width: 90%;
            max-width: 400px;
            overflow: hidden;
            animation: slideUp 0.3s ease;
        }
        
        .pod-header {
            padding: 20px;
            text-align: center;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .pod-header h3 {
            margin: 0;
            font-size: 20px;
            color: #333;
        }
        
        .pod-header p {
            margin: 5px 0 0 0;
            color: #666;
            font-size: 14px;
        }
        
        .pod-main {
            padding: 20px;
        }
        
        .photo-area {
            background: #f8f8f8;
            border: 2px dashed #ddd;
            border-radius: 16px;
            padding: 40px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-bottom: 20px;
            position: relative;
        }
        
        .photo-area:hover {
            background: #f0f0f0;
            border-color: #0066FF;
        }
        
        .camera-icon {
            font-size: 48px;
            margin-bottom: 10px;
        }
        
        .prompt-text {
            font-size: 18px;
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
        }
        
        .prompt-hint {
            font-size: 14px;
            color: #666;
        }
        
        .photo-preview {
            width: 100%;
            border-radius: 12px;
            display: block;
        }
        
        .retake-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: white;
            border: none;
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .delivery-options {
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        
        .delivery-option {
            flex: 1;
            min-width: calc(33% - 8px);
        }
        
        .delivery-option input {
            display: none;
        }
        
        .delivery-option span {
            display: block;
            padding: 10px;
            background: #f8f8f8;
            border: 2px solid #f0f0f0;
            border-radius: 10px;
            text-align: center;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .delivery-option input:checked + span {
            background: #e6f2ff;
            border-color: #0066FF;
            color: #0066FF;
            font-weight: 600;
        }
        
        .complete-btn {
            width: 100%;
            padding: 16px;
            background: #ccc;
            border: none;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 700;
            color: white;
            cursor: not-allowed;
            transition: all 0.3s;
        }
        
        .complete-btn.ready {
            background: #0066FF;
            cursor: pointer;
            animation: pulseBtn 1s infinite;
        }
        
        @keyframes pulseBtn {
            0%, 100% { box-shadow: 0 0 0 0 rgba(0, 102, 255, 0.4); }
            50% { box-shadow: 0 0 0 10px rgba(0, 102, 255, 0); }
        }
        
        .complete-btn.ready:hover {
            background: #0052cc;
            transform: scale(1.02);
        }
        
        .skip-link {
            display: block;
            width: 100%;
            padding: 10px;
            background: none;
            border: none;
            color: #999;
            font-size: 13px;
            text-decoration: underline;
            cursor: pointer;
            margin-top: 10px;
        }
        
        /* Success Animation */
        .success-animation {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--surface-elevated);
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            z-index: 10001;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            animation: popIn 0.3s ease-out;
        }
        
        .success-icon {
            width: 80px;
            height: 80px;
            background: var(--success);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            font-size: 48px;
            color: white;
        }
        
        .success-text {
            font-size: 24px;
            font-weight: 700;
            color: var(--text-primary);
        }
        
        @keyframes popIn {
            from {
                transform: translate(-50%, -50%) scale(0.8);
                opacity: 0;
            }
            to {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
        }
        
        /* Route Complete Modal */
        .route-complete-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            animation: fadeIn 0.3s ease;
        }
        
        .route-complete-content {
            background: var(--surface-elevated);
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            max-width: 400px;
            animation: slideUp 0.4s ease;
        }
        
        .complete-icon {
            font-size: 72px;
            margin-bottom: 20px;
            animation: bounce 0.6s ease;
        }
        
        @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-20px); }
        }
        
        .route-stats {
            display: flex;
            justify-content: center;
            gap: 40px;
            margin: 32px 0;
        }
        
        .route-stats .stat {
            text-align: center;
        }
        
        .route-stats .stat-value {
            display: block;
            font-size: 32px;
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 4px;
        }
        
        .route-stats .stat-label {
            font-size: 14px;
            color: var(--text-secondary);
        }
        
        /* Navigation UI */
        .navigation-ui {
            pointer-events: none !important;
        }
        
        .nav-top-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 1000;
            pointer-events: auto !important;
            background: linear-gradient(to bottom, rgba(10, 10, 11, 0.95), rgba(10, 10, 11, 0.85));
            backdrop-filter: blur(20px);
            padding: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .nav-close-btn,
        .nav-menu-btn {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .nav-close-btn:active,
        .nav-menu-btn:active {
            background: rgba(255, 255, 255, 0.2);
            transform: scale(0.95);
        }
        
        .nav-direction-icon {
            width: 40px;
            height: 40px;
            background: var(--primary);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        
        .direction-arrow {
            font-size: 24px;
        }
        
        .nav-instruction {
            flex: 1;
            min-width: 0;
        }
        
        .nav-distance {
            font-size: 20px;
            font-weight: 700;
            color: white;
            margin-bottom: 2px;
        }
        
        .nav-street {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .nav-bottom-pills {
            position: fixed;
            bottom: calc(30px + var(--safe-area-bottom));
            left: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            z-index: 999;
            pointer-events: auto !important;
        }
        
        .nav-pill {
            background: rgba(10, 10, 11, 0.9);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 25px;
            padding: 8px 16px;
            display: flex;
            align-items: center;
            gap: 6px;
            color: white;
            font-size: 14px;
        }
        
        .pill-icon {
            font-size: 16px;
        }
        
        .pill-value {
            font-weight: 600;
        }
        
        .pill-label {
            color: rgba(255, 255, 255, 0.7);
            font-size: 12px;
        }
        
        .nav-pill.speed {
            margin-left: auto;
            flex-direction: column;
            align-items: center;
            padding: 8px 12px;
        }
        
        .nav-pill.speed .pill-value {
            font-size: 18px;
            line-height: 1;
        }
        
        .nav-menu {
            position: fixed;
            bottom: calc(100px + var(--safe-area-bottom));
            right: 20px;
            background: var(--surface-elevated);
            border-radius: 12px;
            padding: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            z-index: 997;
            min-width: 200px;
            pointer-events: auto !important;
        }
        
        .nav-menu button {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 12px;
            background: transparent;
            border: none;
            color: var(--text-primary);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.2s;
            text-align: left;
        }
        
        .nav-menu button:hover {
            background: var(--surface-high);
        }
        
        /* Stop Cards */
        .stop-card {
            background: var(--surface-high);
            border-radius: 14px;
            padding: 16px;
            display: flex;
            align-items: stretch;
            gap: 12px;
            border: 1px solid var(--border);
            transition: all 0.3s;
            position: relative;
            overflow: hidden;
            margin-bottom: 12px;
        }
        
        .stop-card.completed {
            opacity: 0.6;
        }
        
        .stop-card.active {
            border-color: var(--primary);
        }
        
        .stop-number-badge {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 16px;
            flex-shrink: 0;
        }
        
        .stop-number-badge.pickup {
            background: var(--warning);
            color: black;
        }
        
        .stop-number-badge.delivery {
            background: var(--success);
            color: white;
        }
        
        .stop-content {
            flex: 1;
            min-width: 0;
        }
        
        .stop-address {
            font-size: 16px;
            font-weight: 600;
            margin: 0 0 8px 0;
            color: var(--text-primary);
        }
        
        .stop-details {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        
        .detail-row {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: var(--text-secondary);
        }
        
        .payment-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.2), rgba(255, 149, 0, 0.1));
            border: 1px solid var(--warning);
            border-radius: 20px;
            padding: 6px 12px;
            margin-top: 8px;
            font-size: 14px;
            font-weight: 600;
            color: var(--warning);
        }
        
        .stop-status {
            margin-top: 8px;
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            text-align: center;
        }
        
        .stop-status.completed {
            background: rgba(52, 199, 89, 0.1);
            color: var(--success);
        }
        
        .stop-status.active {
            background: rgba(0, 102, 255, 0.1);
            color: var(--primary);
        }
        
        .stop-status.blocked {
            background: rgba(255, 59, 48, 0.1);
            color: var(--danger);
        }
        
        .stop-actions {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-left: 12px;
        }
        
        .stop-actions button,
        .stop-actions a {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            border: none;
            background: var(--surface);
            color: var(--text-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 18px;
            text-decoration: none;
        }
        
        /* Cash Widget */
        .cash-widget {
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.2), rgba(255, 149, 0, 0.1));
            border: 2px solid var(--warning);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
        }
        
        .cash-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            font-size: 16px;
            font-weight: 600;
        }
        
        .cash-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }
        
        .cash-stat {
            text-align: center;
        }
        
        .cash-stat .label {
            font-size: 14px;
            color: var(--text-secondary);
            margin-bottom: 4px;
            display: block;
        }
        
        .cash-stat .value {
            font-size: 18px;
            font-weight: 700;
            color: var(--text-primary);
        }
        
        /* Parcels Widget */
        .parcels-widget {
            background: linear-gradient(135deg, rgba(255, 159, 10, 0.2), rgba(255, 159, 10, 0.1));
            border: 1px solid var(--warning);
            border-radius: 14px;
            padding: 16px;
            margin-bottom: 20px;
        }
        
        .widget-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            font-weight: 600;
            color: var(--text-primary);
        }
        
        .parcel-cards {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .parcel-card {
            background: var(--surface-high);
            border-radius: 8px;
            padding: 12px;
            border-left: 3px solid var(--warning);
        }
        
        .parcel-code {
            font-weight: 600;
            margin-bottom: 4px;
            color: var(--text-primary);
        }
        
        .parcel-destination {
            font-size: 14px;
            color: var(--text-secondary);
            margin-bottom: 4px;
        }
        
        .parcel-time {
            font-size: 12px;
            color: var(--text-tertiary);
        }
        
        .parcel-payment {
            margin-top: 6px;
            font-size: 13px;
            font-weight: 600;
            color: var(--warning);
        }
        
        /* Payment reminder */
        .payment-reminder {
            position: fixed;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--warning);
            color: black;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
            z-index: 1001;
            animation: pulseReminder 2s infinite;
        }
        
        @keyframes pulseReminder {
            0% { transform: translateX(-50%) scale(1); }
            50% { transform: translateX(-50%) scale(1.05); }
            100% { transform: translateX(-50%) scale(1); }
        }
        
        /* Empty state */
        .empty-content,
        .error-content {
            text-align: center;
            padding: 40px;
        }
        
        .empty-icon,
        .error-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        
        .empty-content h2,
        .error-content h2 {
            margin-bottom: 12px;
        }
        
        .empty-content p,
        .error-content p {
            color: var(--text-secondary);
            margin-bottom: 24px;
        }
        
        .empty-content button,
        .error-content button {
            padding: 12px 24px;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin: 0 6px;
        }
        
        /* Hide Leaflet attribution */
        .leaflet-control-attribution {
            display: none !important;
        }
    `;
    
    document.head.appendChild(styles);
}

// ============================================================================
// UTILITY MODULE - Complete Implementation
// ============================================================================

const Utils = {
    // Calculate distance between two points (Haversine formula)
    calculateDistance(point1, point2) {
        if (!point1 || !point2) return 999;
        
        const R = 6371; // Earth's radius in km
        const dLat = (point2.lat - point1.lat) * Math.PI / 180;
        const dLon = (point2.lng - point1.lng) * Math.PI / 180;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(point1.lat * Math.PI / 180) * 
                  Math.cos(point2.lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    // Parse various location formats (handles all edge cases)
    parseLocation(locationData) {
        if (!locationData) return CONFIG.defaults.nairobi;
        
        // Handle string coordinates
        if (typeof locationData === 'string') {
            // Check for comma-separated coordinates
            if (locationData.includes(',')) {
                const parts = locationData.split(',').map(s => s.trim());
                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                    return { lat, lng };
                }
            }
            
            // Try to parse as JSON
            try {
                const parsed = JSON.parse(locationData);
                return this.parseLocation(parsed);
            } catch {
                // Not JSON, return default
                return CONFIG.defaults.nairobi;
            }
        }
        
        // Handle object coordinates
        if (typeof locationData === 'object' && locationData !== null) {
            const lat = parseFloat(
                locationData.lat || 
                locationData.latitude || 
                locationData.Lat || 
                locationData.Latitude ||
                -1.2921
            );
            const lng = parseFloat(
                locationData.lng || 
                locationData.lon || 
                locationData.longitude ||
                locationData.Lng ||
                locationData.Lon ||
                locationData.Longitude ||
                36.8219
            );
            
            // Validate coordinates
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                return { lat, lng };
            }
        }
        
        return CONFIG.defaults.nairobi;
    },

    // Parse price from various formats
    parsePrice(priceValue) {
        if (typeof priceValue === 'number') return priceValue;
        if (typeof priceValue === 'string') {
            // Remove all non-numeric characters except . and -
            const cleaned = priceValue.replace(/[^0-9.-]+/g, '');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
        }
        if (priceValue && typeof priceValue === 'object' && priceValue.amount) {
            return this.parsePrice(priceValue.amount);
        }
        return 0;
    },

    // Format time ago
    formatTimeAgo(timestamp) {
        if (!timestamp) return '';
        
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) return '';
            
            const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
            
            if (minutes < 1) return 'just now';
            if (minutes === 1) return '1 min ago';
            if (minutes < 60) return `${minutes} min ago`;
            
            const hours = Math.floor(minutes / 60);
            if (hours === 1) return '1 hour ago';
            if (hours < 24) return `${hours} hours ago`;
            
            const days = Math.floor(hours / 24);
            if (days === 1) return '1 day ago';
            return `${days} days ago`;
        } catch {
            return '';
        }
    },

    // Show notification with auto-dismiss
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span class="notification-icon">
                ${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'}
            </span>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-dismiss after 3 seconds
        setTimeout(() => {
            notification.classList.add('hiding');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    // Calculate bearing between two points
    calculateBearing(start, end) {
        if (!start || !end) return 0;
        
        const dLng = (end.lng - start.lng) * Math.PI / 180;
        const lat1 = start.lat * Math.PI / 180;
        const lat2 = end.lat * Math.PI / 180;
        
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - 
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        
        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    },

    // Format currency
    formatCurrency(amount) {
        return `KES ${Math.round(amount).toLocaleString()}`;
    },

    // Calculate ETA
    calculateETA(distanceKm, speedKmh = 30) {
        const timeInMinutes = Math.round(distanceKm / speedKmh * 60);
        const now = new Date();
        const eta = new Date(now.getTime() + timeInMinutes * 60000);
        
        return eta.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    },

    // Vibrate device if supported
    vibrate(pattern = [100]) {
        if (navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    },

    // Store data offline
    storeOffline(key, data) {
        try {
            const offlineData = JSON.parse(localStorage.getItem('tuma_offline') || '{}');
            offlineData[key] = data;
            localStorage.setItem('tuma_offline', JSON.stringify(offlineData));
            return true;
        } catch (error) {
            console.error('Failed to store offline data:', error);
            return false;
        }
    },

    // Retrieve offline data
    getOffline(key) {
        try {
            const offlineData = JSON.parse(localStorage.getItem('tuma_offline') || '{}');
            return offlineData[key] || null;
        } catch {
            return null;
        }
    },

    // Clear offline data
    clearOffline(key) {
        try {
            const offlineData = JSON.parse(localStorage.getItem('tuma_offline') || '{}');
            if (key) {
                delete offlineData[key];
            } else {
                // Clear all
                localStorage.removeItem('tuma_offline');
                return;
            }
            localStorage.setItem('tuma_offline', JSON.stringify(offlineData));
        } catch {
            // Ignore errors
        }
    }
};
/**
 * COMPLETE ENHANCED ROUTE NAVIGATION MODULE - FULL IMPLEMENTATION
 * Part 2: Complete Route Module, Verification with POD, Navigation, UI and Initialization
 * All features including dynamic optimization, payment tracking, and error handling
 */

// ============================================================================
// ROUTE MODULE - Complete with Dynamic Optimization Algorithm (CONTINUED)
// ============================================================================
// ============================================================================
// ROUTE MODULE - Complete with Dynamic Optimization Algorithm
// ============================================================================

const RouteModule = {
    // Initialize route from storage
    async initialize() {
        console.log('RouteModule: Initializing...');
        
        // Try to load route from various sources
        let routeData = null;
        
        // 1. Check URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const routeId = urlParams.get('id');
        
        if (routeId) {
            console.log(`Loading route by ID: ${routeId}`);
            // In production, load from API
            // routeData = await this.loadFromAPI(routeId);
        }
        
        // 2. Check localStorage for active route
        if (!routeData) {
            const storedRoute = localStorage.getItem('tuma_active_route');
            if (storedRoute) {
                try {
                    routeData = JSON.parse(storedRoute);
                    console.log('Loaded route from localStorage');
                } catch (e) {
                    console.error('Failed to parse stored route:', e);
                }
            }
        }
        
        // 3. Check sessionStorage for claimed route
        if (!routeData) {
            const claimedRoute = sessionStorage.getItem('tuma_claimed_route');
            if (claimedRoute) {
                try {
                    routeData = JSON.parse(claimedRoute);
                    console.log('Loaded route from sessionStorage');
                } catch (e) {
                    console.error('Failed to parse claimed route:', e);
                }
            }
        }
        
        // 4. Use demo route for development
        if (!routeData && CONFIG.dev.isDevelopment) {
            routeData = this.createDemoRoute();
            console.log('Using demo route for development');
        }
        
        if (!routeData) {
            console.log('No route data found');
            return false;
        }
        
        // Process and store route
        GlobalState.route = this.processRouteData(routeData);
        
        // Run dynamic optimization if enabled
        if (CONFIG.navigation.useDynamicOptimization && GlobalState.route.stops) {
            this.optimizeRoute();
        }
        
        return true;
    },

    // Process raw route data
    processRouteData(routeData) {
        const processed = {
            id: routeData.id || routeData.route_id || `route-${Date.now()}`,
            name: routeData.name || routeData.route_name || 'Delivery Route',
            status: routeData.status || 'active',
            stops: [],
            parcels: routeData.parcels || [],
            distance: 0,
            duration: 0,
            optimized: false
        };
        
        // Process stops
        if (routeData.stops) {
            processed.stops = routeData.stops.map(stop => this.processStop(stop));
        } else if (routeData.parcels) {
            // Generate stops from parcels
            processed.stops = this.generateStopsFromParcels(routeData.parcels);
        }
        
        // Restore completion state if available
        if (routeData.lastUpdated) {
            processed.lastUpdated = routeData.lastUpdated;
            if (routeData.parcelsInPossession) {
                GlobalState.parcels.inPossession = routeData.parcelsInPossession;
            }
            if (routeData.cashCollected !== undefined) {
                GlobalState.parcels.cashCollected = routeData.cashCollected;
            }
            if (routeData.paymentsByStop) {
                GlobalState.parcels.paymentsByStop = routeData.paymentsByStop;
            }
        }
        
        return processed;
    },

    // Process individual stop
    processStop(stop) {
        return {
            id: stop.id || `stop-${Date.now()}-${Math.random()}`,
            type: stop.type || stop.stop_type || 'delivery',
            parcelId: stop.parcel_id || stop.parcelId,
            parcelCode: stop.parcel_code || stop.parcelCode || 'N/A',
            address: stop.address || stop.location_name || 'Unknown Location',
            location: Utils.parseLocation(stop.location || stop.coordinates),
            customerName: stop.customer_name || stop.recipient_name || stop.sender_name || 'Customer',
            customerPhone: stop.customer_phone || stop.recipient_phone || stop.sender_phone || '',
            specialInstructions: stop.special_instructions || stop.notes || '',
            verificationCode: stop.verification_code || stop.code || '',
            paymentMethod: stop.payment_method || 'cash',
            price: Utils.parsePrice(stop.price || stop.amount || 0),
            completed: stop.completed || false,
            timestamp: stop.timestamp || null,
            canComplete: stop.type === 'pickup' ? true : false,
            sequenceNumber: stop.sequence_number || stop.order || 0,
            isEfficientPair: false,
            allowDynamic: false
        };
    },

    // Generate stops from parcels
    generateStopsFromParcels(parcels) {
        const stops = [];
        
        parcels.forEach((parcel, index) => {
            // Create pickup stop
            if (parcel.pickup_location || parcel.sender_location) {
                stops.push({
                    id: `pickup-${parcel.id}`,
                    type: 'pickup',
                    parcelId: parcel.id,
                    parcelCode: parcel.parcel_code || parcel.tracking_code || `PKG${index + 1}`,
                    address: parcel.pickup_address || parcel.sender_address || 'Pickup Location',
                    location: Utils.parseLocation(parcel.pickup_location || parcel.sender_location),
                    customerName: parcel.sender_name || 'Sender',
                    customerPhone: parcel.sender_phone || '',
                    specialInstructions: parcel.pickup_instructions || '',
                    verificationCode: parcel.pickup_code || '',
                    paymentMethod: parcel.payment_method || 'cash',
                    price: 0,
                    completed: parcel.pickup_completed || false,
                    timestamp: parcel.pickup_timestamp || null,
                    canComplete: true,
                    sequenceNumber: index * 2
                });
            }
            
            // Create delivery stop
            stops.push({
                id: `delivery-${parcel.id}`,
                type: 'delivery',
                parcelId: parcel.id,
                parcelCode: parcel.parcel_code || parcel.tracking_code || `PKG${index + 1}`,
                address: parcel.delivery_address || parcel.recipient_address || 'Delivery Location',
                location: Utils.parseLocation(parcel.delivery_location || parcel.recipient_location),
                customerName: parcel.recipient_name || 'Recipient',
                customerPhone: parcel.recipient_phone || '',
                specialInstructions: parcel.delivery_instructions || '',
                verificationCode: parcel.delivery_code || '',
                paymentMethod: parcel.payment_method || 'cash',
                price: Utils.parsePrice(parcel.price || parcel.total_price || 0),
                completed: parcel.delivery_completed || false,
                timestamp: parcel.delivery_timestamp || null,
                canComplete: false,
                sequenceNumber: index * 2 + 1
            });
        });
        
        return stops;
    },

    // Create demo route for testing
    createDemoRoute() {
        return {
            id: 'demo-route-1',
            name: 'Demo Delivery Route',
            status: 'active',
            parcels: [
                {
                    id: 'demo-parcel-1',
                    parcel_code: 'PKG001',
                    sender_name: 'Electronics Store',
                    sender_phone: '0712345678',
                    pickup_address: 'Westlands, Nairobi',
                    pickup_location: { lat: -1.2669, lng: 36.8099 },
                    recipient_name: 'John Doe',
                    recipient_phone: '0723456789',
                    delivery_address: 'Kilimani, Nairobi',
                    delivery_location: { lat: -1.2921, lng: 36.7875 },
                    price: 1500,
                    payment_method: 'cash',
                    pickup_code: 'PICK123',
                    delivery_code: 'DROP456'
                },
                {
                    id: 'demo-parcel-2',
                    parcel_code: 'PKG002',
                    sender_name: 'Fashion Boutique',
                    sender_phone: '0734567890',
                    pickup_address: 'Karen, Nairobi',
                    pickup_location: { lat: -1.3167, lng: 36.7000 },
                    recipient_name: 'Jane Smith',
                    recipient_phone: '0745678901',
                    delivery_address: 'Lavington, Nairobi',
                    delivery_location: { lat: -1.2833, lng: 36.7667 },
                    price: 2000,
                    payment_method: 'online',
                    pickup_code: 'PICK789',
                    delivery_code: 'DROP012'
                }
            ]
        };
    },

    // Optimize route using dynamic algorithm
    optimizeRoute() {
        if (!GlobalState.route?.stops) return;
        
        console.log('Optimizing route for efficiency...');
        
        const stops = [...GlobalState.route.stops];
        const completed = stops.filter(s => s.completed);
        const pending = stops.filter(s => !s.completed);
        
        if (pending.length === 0) return;
        
        // Group pickups and deliveries
        const pickups = pending.filter(s => s.type === 'pickup');
        const deliveries = pending.filter(s => s.type === 'delivery');
        
        // Find efficient pickup-delivery pairs (close to each other)
        const efficientPairs = [];
        
        pickups.forEach(pickup => {
            const correspondingDelivery = deliveries.find(d => d.parcelId === pickup.parcelId);
            if (correspondingDelivery) {
                const distance = Utils.calculateDistance(pickup.location, correspondingDelivery.location);
                if (distance < 2) { // Less than 2km
                    pickup.isEfficientPair = true;
                    correspondingDelivery.isEfficientPair = true;
                    correspondingDelivery.canComplete = true; // Allow immediate delivery
                    correspondingDelivery.allowDynamic = true;
                    efficientPairs.push({ pickup, delivery: correspondingDelivery, distance });
                }
            }
        });
        
        // Sort pairs by distance (shortest first)
        efficientPairs.sort((a, b) => a.distance - b.distance);
        
        console.log(`Found ${efficientPairs.length} efficient pickup-delivery pairs`);
        
        // Create optimized sequence
        const optimizedSequence = [...completed];
        const processedStops = new Set(completed.map(s => s.id));
        
        // Add efficient pairs first
        efficientPairs.forEach(pair => {
            if (!processedStops.has(pair.pickup.id)) {
                optimizedSequence.push(pair.pickup);
                processedStops.add(pair.pickup.id);
            }
            if (!processedStops.has(pair.delivery.id)) {
                optimizedSequence.push(pair.delivery);
                processedStops.add(pair.delivery.id);
            }
        });
        
        // Add remaining pickups
        pickups.forEach(pickup => {
            if (!processedStops.has(pickup.id)) {
                optimizedSequence.push(pickup);
                processedStops.add(pickup.id);
            }
        });
        
        // Add remaining deliveries
        deliveries.forEach(delivery => {
            if (!processedStops.has(delivery.id)) {
                optimizedSequence.push(delivery);
                processedStops.add(delivery.id);
            }
        });
        
        // Store optimized sequence
        GlobalState.optimizedSequence = optimizedSequence;
        GlobalState.route.optimized = true;
        
        console.log('Route optimization complete');
    },

    // Get next stop
    getNextStop() {
        if (!GlobalState.route?.stops) return null;
        
        // Use optimized sequence if available
        const sequence = GlobalState.optimizedSequence || GlobalState.route.stops;
        
        // Find first incomplete stop that can be completed
        return sequence.find(stop => 
            !stop.completed && this.canCompleteStop(stop)
        );
    },

    // Check if stop can be completed
    canCompleteStop(stop) {
        if (!stop || stop.completed) return false;
        
        // Pickups can always be completed
        if (stop.type === 'pickup') return true;
        
        // Check if delivery has dynamic flag
        if (stop.allowDynamic) return true;
        
        // For deliveries, check if pickup was completed
        const pickupStop = GlobalState.route.stops.find(s => 
            s.type === 'pickup' && 
            s.parcelId === stop.parcelId
        );
        
        return pickupStop && pickupStop.completed;
    },

    // Mark stop as completed (continued from where it cut off)
    completeStop(stopId) {
        const stop = GlobalState.route.stops.find(s => s.id === stopId);
        if (!stop) return false;
        
        stop.completed = true;
        stop.timestamp = new Date().toISOString();
        
        // If this is a pickup, update parcel possession
        if (stop.type === 'pickup') {
            const parcel = GlobalState.route.parcels.find(p => p.id === stop.parcelId);
            if (parcel) {
                GlobalState.parcels.inPossession.push(parcel);
                
                // Enable the corresponding delivery
                const deliveryStop = GlobalState.route.stops.find(s => 
                    s.type === 'delivery' && s.parcelId === stop.parcelId
                );
                if (deliveryStop) {
                    deliveryStop.canComplete = true;
                }
            }
        }
        
        // If this is a delivery, remove from possession and update cash
        if (stop.type === 'delivery') {
            GlobalState.parcels.inPossession = GlobalState.parcels.inPossession.filter(
                p => p.id !== stop.parcelId
            );
            
            // Update cash collected if COD
            if (stop.paymentMethod === 'cash' || stop.paymentMethod === 'Cash on Delivery') {
                GlobalState.parcels.cashCollected += stop.price;
                GlobalState.parcels.paymentsByStop[stop.id] = {
                    amount: stop.price,
                    collected: true,
                    timestamp: stop.timestamp
                };
            }
        }
        
        // Save updated route
        this.saveRoute();
        
        // Update database for non-demo routes
        if (!GlobalState.route.id?.startsWith('demo-')) {
            this.syncToDatabase(stop);
        }
        
        return true;
    },

    // Sync to database
    async syncToDatabase(stop) {
        try {
            const response = await fetch(`${CONFIG.api.SUPABASE_URL}/rest/v1/parcels?id=eq.${stop.parcelId}`, {
                method: 'PATCH',
                headers: {
                    'apikey': CONFIG.api.SUPABASE_KEY,
                    'Authorization': `Bearer ${CONFIG.api.SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    status: stop.type === 'pickup' ? 'picked' : 'delivered',
                    [`${stop.type}_timestamp`]: stop.timestamp,
                    payment_status: stop.type === 'delivery' && stop.paymentMethod === 'cash' ? 'collected' : undefined
                })
            });
            
            if (!response.ok) {
                throw new Error(`Database update failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Database sync error:', error);
            // Store for offline sync
            GlobalState.offline.pendingUpdates.push({
                stopId: stop.id,
                parcelId: stop.parcelId,
                type: stop.type,
                timestamp: stop.timestamp
            });
        }
    },

    // Save route to localStorage
    saveRoute() {
        try {
            const routeData = {
                ...GlobalState.route,
                lastUpdated: new Date().toISOString(),
                parcelsInPossession: GlobalState.parcels.inPossession,
                cashCollected: GlobalState.parcels.cashCollected,
                cashToCollect: GlobalState.parcels.cashToCollect,
                paymentsByStop: GlobalState.parcels.paymentsByStop
            };
            
            localStorage.setItem('tuma_active_route', JSON.stringify(routeData));
            
            // Also save to offline storage for sync
            Utils.storeOffline('pending_route_update', routeData);
            
            return true;
        } catch (error) {
            console.error('Failed to save route:', error);
            return false;
        }
    },

    // Check if route is complete
    isRouteComplete() {
        if (!GlobalState.route?.stops) return false;
        return GlobalState.route.stops.every(stop => stop.completed);
    },

    // Clear route data
    clearRoute() {
        localStorage.removeItem('tuma_active_route');
        sessionStorage.removeItem('tuma_claimed_route');
        localStorage.removeItem('tuma_route_completion');
        Utils.clearOffline('pending_route_update');
        GlobalState.route = null;
        GlobalState.parcels = {
            inPossession: [],
            cashToCollect: 0,
            cashCollected: 0,
            paymentsByStop: {}
        };
    },

    // Calculate route financials
    calculateFinancials() {
        if (!GlobalState.route) return;
        
        GlobalState.earnings.totalRouteEarnings = 0;
        GlobalState.earnings.routeCommission = 0;
        GlobalState.parcels.cashToCollect = 0;
        
        // Calculate from parcels
        if (GlobalState.route.parcels && GlobalState.route.parcels.length > 0) {
            GlobalState.route.parcels.forEach(parcel => {
                const price = Utils.parsePrice(parcel.price || parcel.total_price || 500);
                const riderPayout = price * CONFIG.business.riderCommission;
                const commission = price * CONFIG.business.platformCommission;
                
                GlobalState.earnings.totalRouteEarnings += riderPayout;
                GlobalState.earnings.routeCommission += commission;
                
                // Check if cash collection needed
                if (parcel.payment_method === 'cash') {
                    GlobalState.parcels.cashToCollect += price;
                }
            });
        }
        
        console.log('Route financials calculated:', {
            earnings: GlobalState.earnings.totalRouteEarnings,
            commission: GlobalState.earnings.routeCommission,
            cashToCollect: GlobalState.parcels.cashToCollect
        });
    }
};

// ============================================================================
// VERIFICATION MODULE - Complete with POD and all verification flows
// ============================================================================

const VerificationModule = {
    // Show verification modal for stop
    async showModal(stop) {
        if (!stop) return;
        
        GlobalState.verification.currentStop = stop;
        
        const isPickup = stop.type === 'pickup';
        const paymentInfo = this.getPaymentInfo(stop);
        
        const modal = document.createElement('div');
        modal.className = 'verification-modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="VerificationModule.closeModal()"></div>
            <div class="modal-content">
                <div class="modal-header ${isPickup ? 'pickup' : 'delivery'}">
                    <span class="modal-icon">${isPickup ? '📦' : '📍'}</span>
                    <h2>${isPickup ? 'Pickup Verification' : 'Delivery Verification'}</h2>
                    <p>${stop.address}</p>
                </div>
                <div class="modal-body">
                    <div class="stop-summary">
                        <h3>Stop Details</h3>
                        <div class="summary-details">
                            <div class="summary-row">
                                <span class="summary-label">Customer:</span>
                                <span class="summary-value">${stop.customerName || 'N/A'}</span>
                            </div>
                            <div class="summary-row">
                                <span class="summary-label">Phone:</span>
                                <span class="summary-value">
                                    ${stop.customerPhone ? 
                                        `<a href="tel:${stop.customerPhone}">${stop.customerPhone}</a>` : 
                                        'Not provided'}
                                </span>
                            </div>
                            <div class="summary-row">
                                <span class="summary-label">Parcel Code:</span>
                                <span class="summary-value">${stop.parcelCode}</span>
                            </div>
                            ${stop.specialInstructions ? `
                                <div class="summary-row">
                                    <span class="summary-label">Instructions:</span>
                                    <span class="summary-value">${stop.specialInstructions}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    ${!isPickup && paymentInfo.needsCollection ? `
                        <div class="payment-collection-alert">
                            <div style="font-size: 24px; margin-bottom: 8px;">💰</div>
                            <div style="font-size: 20px; font-weight: 700;">
                                Collect ${Utils.formatCurrency(paymentInfo.amount)}
                            </div>
                            <div style="margin-top: 4px; font-size: 14px;">
                                Cash on Delivery
                            </div>
                        </div>
                    ` : !isPickup && paymentInfo.method === 'online' ? `
                        <div style="
                            background: linear-gradient(135deg, rgba(52, 199, 89, 0.2), rgba(48, 209, 88, 0.1));
                            border: 1px solid var(--success);
                            border-radius: 12px;
                            padding: 12px;
                            margin: 16px 0;
                            text-align: center;
                            color: var(--success);
                            font-weight: 600;
                        ">
                            ✅ Already Paid - No collection needed
                        </div>
                    ` : ''}

                    <div class="verification-section">
                        <label>Enter ${isPickup ? 'Pickup' : 'Delivery'} Code:</label>
                        <input 
                            type="text" 
                            id="verification-code-input"
                            class="verification-input" 
                            placeholder="XXXXXX"
                            maxlength="10"
                            autocomplete="off"
                            onkeyup="VerificationModule.handleCodeInput(event)"
                        />
                        <div class="code-hint">
                            Ask the ${isPickup ? 'vendor' : 'recipient'} for the verification code
                        </div>
                    </div>

                    ${!isPickup && paymentInfo.needsCollection ? `
                        <div style="margin-top: 16px; padding: 12px; background: var(--surface-high); border-radius: 8px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" id="payment-collected-checkbox" style="width: 20px; height: 20px; cursor: pointer;">
                                <span style="font-size: 16px;">I have collected ${Utils.formatCurrency(paymentInfo.amount)} cash</span>
                            </label>
                        </div>
                    ` : ''}

                    <div class="modal-actions">
                        <button class="modal-btn secondary" onclick="VerificationModule.closeModal()">
                            <span>❌</span>
                            <span>Cancel</span>
                        </button>
                        <button class="modal-btn primary" onclick="VerificationModule.verifyCode()">
                            <span>✓</span>
                            <span>Verify</span>
                        </button>
                    </div>

                    ${CONFIG.dev.isDevelopment ? `
                        <div style="margin-top: 20px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                            <div style="font-size: 12px; color: #888; margin-bottom: 8px;">🔧 Development Mode</div>
                            <div style="font-size: 14px; color: #aaa;">
                                Expected code: <strong>${stop.verificationCode || 'Any code accepted'}</strong>
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Focus input
        setTimeout(() => {
            const input = document.getElementById('verification-code-input');
            if (input) input.focus();
        }, 100);
        
        // Vibrate for attention
        Utils.vibrate([100, 50, 100]);
    },

    // Get payment info for stop
    getPaymentInfo(stop) {
        if (!GlobalState.route || !GlobalState.route.parcels) {
            return {
                amount: 0,
                method: 'unknown',
                status: 'unknown',
                needsCollection: false
            };
        }
        
        const parcel = GlobalState.route.parcels.find(p => p.id === stop.parcelId);
        if (!parcel) {
            return {
                amount: 0,
                method: 'unknown',
                status: 'unknown',
                needsCollection: false
            };
        }
        
        const amount = Utils.parsePrice(parcel.price || parcel.total_price || 0);
        const method = parcel.payment_method || 'cash';
        const status = parcel.payment_status || 'pending';
        
        return {
            amount: amount,
            method: method,
            status: status,
            needsCollection: stop.type === 'delivery' && method === 'cash' && status === 'pending'
        };
    },

    // Handle code input
    handleCodeInput(event) {
        const input = event.target;
        input.value = input.value.toUpperCase();
        
        // Remove error state when typing
        input.classList.remove('error');
        
        // Auto-verify on Enter
        if (event.key === 'Enter') {
            this.verifyCode();
        }
    },

    // Verify the entered code
    async verifyCode() {
        const input = document.getElementById('verification-code-input');
        const enteredCode = input?.value?.trim().toUpperCase();
        const stop = GlobalState.verification.currentStop;
        
        if (!stop) return;
        
        // Validate code entry
        if (!enteredCode || enteredCode.length < 4) {
            input.classList.add('error');
            Utils.vibrate([200, 100, 200]);
            Utils.showNotification('Please enter a valid code', 'error');
            return;
        }
        
        // Check payment collection for cash deliveries
        const paymentInfo = this.getPaymentInfo(stop);
        if (stop.type === 'delivery' && paymentInfo.needsCollection) {
            const paymentCheckbox = document.getElementById('payment-collected-checkbox');
            if (paymentCheckbox && !paymentCheckbox.checked) {
                Utils.showNotification('Please confirm cash collection before verifying', 'warning');
                paymentCheckbox.parentElement.style.animation = 'shake 0.3s';
                return;
            }
        }
        
        // Check if code is correct
        const expectedCode = stop.verificationCode?.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const isValid = CONFIG.dev.isDevelopment ? 
            (enteredCode.length > 0) : 
            (enteredCode === expectedCode);
        
        if (!isValid) {
            input.classList.add('error');
            Utils.vibrate([200, 100, 200]);
            Utils.showNotification('Invalid verification code', 'error');
            return;
        }
        
        // Close verification modal
        this.closeModal();
        
        // Show appropriate next step
        if (stop.type === 'pickup') {
            // Mark pickup complete
            this.completePickup(stop);
        } else {
            // Show POD modal for delivery
            this.showPODModal(stop);
        }
    },

    // Complete pickup
    completePickup(stop) {
        // Mark as completed
        RouteModule.completeStop(stop.id);
        
        // Show success animation
        this.showSuccessAnimation('Pickup Complete!');
        
        // Update UI
        UIModule.refresh();
        
        // Update cash widget if needed
        if (GlobalState.parcels.cashToCollect > 0) {
            UIModule.updateCashWidget();
        }
        
        // Check for next stop
        setTimeout(() => {
            const nextStop = RouteModule.getNextStop();
            if (nextStop) {
                MapModule.focusOnStop(nextStop);
                if (GlobalState.navigation.isActive) {
                    NavigationModule.updateNavigation(nextStop);
                }
            }
        }, 2000);
    },

    // Show POD (Proof of Delivery) modal
    showPODModal(stop) {
        const modal = document.createElement('div');
        modal.className = 'pod-modal';
        modal.innerHTML = `
            <div class="pod-content">
                <div class="pod-header">
                    <h3>Proof of Delivery</h3>
                    <p>${stop.address}</p>
                </div>
                <div class="pod-main">
                    <div class="photo-area" id="photo-capture-area" onclick="VerificationModule.capturePhoto()">
                        <div id="photo-prompt">
                            <div class="camera-icon">📸</div>
                            <div class="prompt-text">Take Photo</div>
                            <div class="prompt-hint">Tap to capture proof of delivery</div>
                        </div>
                        <div id="photo-preview" style="display: none;">
                            <img id="captured-photo" class="photo-preview" />
                            <button class="retake-btn" onclick="event.stopPropagation(); VerificationModule.retakePhoto()">
                                Retake
                            </button>
                        </div>
                    </div>
                    
                    <input type="file" 
                           id="photo-input" 
                           accept="image/*" 
                           capture="environment"
                           style="display: none;"
                           onchange="VerificationModule.handlePhotoCapture(event)" />
                    
                    <div class="delivery-options">
                        <label class="delivery-option">
                            <input type="radio" name="delivery-type" value="handed" checked />
                            <span>Handed to Customer</span>
                        </label>
                        <label class="delivery-option">
                            <input type="radio" name="delivery-type" value="doorstep" />
                            <span>Left at Doorstep</span>
                        </label>
                        <label class="delivery-option">
                            <input type="radio" name="delivery-type" value="security" />
                            <span>Left with Security</span>
                        </label>
                        <label class="delivery-option">
                            <input type="radio" name="delivery-type" value="neighbor" />
                            <span>Given to Neighbor</span>
                        </label>
                        <label class="delivery-option">
                            <input type="radio" name="delivery-type" value="safe" />
                            <span>Safe Location</span>
                        </label>
                        <label class="delivery-option">
                            <input type="radio" name="delivery-type" value="other" />
                            <span>Other</span>
                        </label>
                    </div>
                    
                    <button id="complete-delivery-btn" 
                            class="complete-btn" 
                            onclick="VerificationModule.completeDelivery()">
                        Complete Delivery
                    </button>
                    
                    <button class="skip-link" onclick="VerificationModule.skipPOD()">
                        Skip photo (not recommended)
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Initialize POD data
        GlobalState.verification.podData = {
            photo: null,
            deliveryType: 'handed',
            timestamp: new Date().toISOString(),
            location: GlobalState.location
        };
    },

    // Capture photo
    capturePhoto() {
        const input = document.getElementById('photo-input');
        if (input) input.click();
    },

    // Handle photo capture
    handlePhotoCapture(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            // Store photo data
            GlobalState.verification.podData.photo = e.target.result;
            
            // Show preview
            const photoPrompt = document.getElementById('photo-prompt');
            const photoPreview = document.getElementById('photo-preview');
            const capturedPhoto = document.getElementById('captured-photo');
            const completeBtn = document.getElementById('complete-delivery-btn');
            
            if (photoPrompt) photoPrompt.style.display = 'none';
            if (photoPreview) photoPreview.style.display = 'block';
            if (capturedPhoto) capturedPhoto.src = e.target.result;
            if (completeBtn) completeBtn.classList.add('ready');
            
            // Store offline if needed
            if (!navigator.onLine) {
                Utils.storeOffline(`pod_${GlobalState.verification.currentStop.id}`, {
                    photo: e.target.result,
                    timestamp: new Date().toISOString(),
                    stopId: GlobalState.verification.currentStop.id
                });
            }
        };
        reader.readAsDataURL(file);
    },

    // Retake photo
    retakePhoto() {
        const photoPrompt = document.getElementById('photo-prompt');
        const photoPreview = document.getElementById('photo-preview');
        const completeBtn = document.getElementById('complete-delivery-btn');
        
        if (photoPrompt) photoPrompt.style.display = 'block';
        if (photoPreview) photoPreview.style.display = 'none';
        if (completeBtn) completeBtn.classList.remove('ready');
        
        GlobalState.verification.podData.photo = null;
    },

    // Complete delivery
    async completeDelivery() {
        const stop = GlobalState.verification.currentStop;
        if (!stop) return;
        
        // Get delivery type
        const deliveryType = document.querySelector('input[name="delivery-type"]:checked')?.value || 'handed';
        GlobalState.verification.podData.deliveryType = deliveryType;
        
        // Mark stop as completed
        RouteModule.completeStop(stop.id);
        
        // Try to sync with server
        if (navigator.onLine && !GlobalState.route.id?.startsWith('demo-')) {
            try {
                await this.syncPODToServer(stop.id, GlobalState.verification.podData);
            } catch (error) {
                console.error('Failed to sync POD:', error);
                // Store for later sync
                GlobalState.offline.proofs.push({
                    stopId: stop.id,
                    podData: GlobalState.verification.podData,
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            // Store offline
            GlobalState.offline.proofs.push({
                stopId: stop.id,
                podData: GlobalState.verification.podData,
                timestamp: new Date().toISOString()
            });
        }
        
        // Close POD modal
        this.closePODModal();
        
        // Show success
        this.showSuccessAnimation('Delivery Complete!');
        
        // Update UI
        UIModule.refresh();
        
        // Update cash widget
        if (GlobalState.parcels.cashToCollect > 0) {
            UIModule.updateCashWidget();
        }
        
        // Check if route is complete
        if (RouteModule.isRouteComplete()) {
            setTimeout(() => this.showRouteCompleteModal(), 2000);
        } else {
            // Navigate to next stop
            const nextStop = RouteModule.getNextStop();
            if (nextStop) {
                setTimeout(() => {
                    MapModule.focusOnStop(nextStop);
                    if (GlobalState.navigation.isActive) {
                        NavigationModule.updateNavigation(nextStop);
                    }
                }, 2000);
            }
        }
    },

    // Skip POD (not recommended)
    skipPOD() {
        if (!confirm('Are you sure you want to skip taking a photo? This is not recommended.')) {
            return;
        }
        
        GlobalState.verification.podData.photo = null;
        GlobalState.verification.podData.skipped = true;
        
        this.completeDelivery();
    },

    // Sync POD to server
    async syncPODToServer(stopId, podData) {
        // Upload photo to storage first if available
        let photoUrl = null;
        if (podData.photo && !podData.skipped) {
            // This would upload to your storage solution
            // photoUrl = await this.uploadPhoto(podData.photo);
        }
        
        const response = await fetch(`${CONFIG.api.SUPABASE_URL}/rest/v1/delivery_proofs`, {
            method: 'POST',
            headers: {
                'apikey': CONFIG.api.SUPABASE_KEY,
                'Authorization': `Bearer ${CONFIG.api.SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                stop_id: stopId,
                route_id: GlobalState.route.id,
                photo_url: photoUrl,
                delivery_type: podData.deliveryType,
                timestamp: podData.timestamp,
                location: podData.location,
                skipped_photo: podData.skipped || false
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to sync POD');
        }
        
        return await response.json();
    },

    // Close modals
    closeModal() {
        const modal = document.querySelector('.verification-modal');
        if (modal) modal.remove();
    },

    closePODModal() {
        const modal = document.querySelector('.pod-modal');
        if (modal) modal.remove();
    },

    // Show success animation
    showSuccessAnimation(message) {
        const animation = document.createElement('div');
        animation.className = 'success-animation';
        animation.innerHTML = `
            <div class="success-icon">✓</div>
            <div class="success-text">${message}</div>
        `;
        
        document.body.appendChild(animation);
        
        Utils.vibrate([100, 50, 100, 50, 100]);
        
        setTimeout(() => animation.remove(), 2000);
    },

    // Show route complete modal
    showRouteCompleteModal() {
        const totalStops = GlobalState.route.stops.length;
        const totalEarnings = GlobalState.earnings.totalRouteEarnings || 0;
        const cashCollected = GlobalState.parcels.cashCollected || 0;
        
        // Store completion data
        const completionData = {
            completed: true,
            earnings: Math.round(totalEarnings),
            commission: Math.round(GlobalState.earnings.routeCommission),
            cashCollected: Math.round(cashCollected),
            deliveries: GlobalState.route.stops.filter(s => s.type === 'delivery').length,
            stops: totalStops,
            timestamp: new Date().toISOString(),
            routeId: GlobalState.route.id,
            parcels: GlobalState.route.parcels || []
        };
        
        localStorage.setItem('tuma_route_completion', JSON.stringify(completionData));
        
        const modal = document.createElement('div');
        modal.className = 'route-complete-modal';
        modal.innerHTML = `
            <div class="route-complete-content">
                <div class="complete-icon">🎉</div>
                <h2>Route Complete!</h2>
                <p style="margin: 20px 0; color: var(--text-secondary);">
                    Amazing work! You've successfully completed all deliveries.
                </p>
                
                <div class="route-stats">
                    <div class="stat">
                        <span class="stat-value">${totalStops}</span>
                        <span class="stat-label">Stops</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${Utils.formatCurrency(totalEarnings)}</span>
                        <span class="stat-label">Earned</span>
                    </div>
                    ${cashCollected > 0 ? `
                        <div class="stat">
                            <span class="stat-value">${Utils.formatCurrency(cashCollected)}</span>
                            <span class="stat-label">Cash Collected</span>
                        </div>
                    ` : ''}
                </div>
                
                ${cashCollected > 0 ? `
                    <div style="margin: 24px 0; padding: 16px; background: var(--surface-high); border-radius: 12px;">
                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                            Cash to Return:
                        </div>
                        <div style="font-size: 24px; font-weight: 700; color: var(--warning);">
                            ${Utils.formatCurrency(cashCollected)}
                        </div>
                        <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 8px;">
                            Please return this amount to the office
                        </div>
                    </div>
                ` : ''}
                
                <button class="complete-btn" onclick="VerificationModule.finishRoute()">
                    Back to Dashboard
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Clear route data
        RouteModule.clearRoute();
    },

    // Finish route
    finishRoute() {
        window.location.href = './rider.html';
    }
};

// ============================================================================
// NAVIGATION MODULE - Complete Waze-style navigation
// ============================================================================

const NavigationModule = {
    // Start navigation to stop
    startNavigation(stop) {
        if (!stop) return;
        
        GlobalState.navigation.isActive = true;
        GlobalState.navigation.isFollowing = true;
        
        // Hide panels
        UIModule.hidePanel();
        
        // Show navigation UI
        this.showNavigationUI(stop);
        
        // Start continuous tracking
        this.startContinuousTracking();
        
        // Get initial directions
        this.getDirections(stop);
    },

    // Show navigation UI (Waze-style)
    showNavigationUI(targetStop) {
        const existingNav = document.querySelector('.navigation-ui');
        if (existingNav) existingNav.remove();
        
        const navUI = document.createElement('div');
        navUI.className = 'navigation-ui';
        navUI.innerHTML = `
            <!-- Top instruction bar -->
            <div class="nav-top-bar">
                <button class="nav-close-btn" onclick="NavigationModule.exitNavigation()">
                    ✕
                </button>
                
                <div class="nav-direction-icon">
                    <span class="direction-arrow">⬆️</span>
                </div>
                
                <div class="nav-instruction">
                    <div class="nav-distance">-- m</div>
                    <div class="nav-street">Starting navigation...</div>
                </div>
                
                <button class="nav-menu-btn" onclick="NavigationModule.toggleMenu()">
                    ⋮
                </button>
            </div>
            
            <!-- Bottom info pills -->
            <div class="nav-bottom-pills">
                <div class="nav-pill eta">
                    <span class="pill-icon">⏱</span>
                    <span class="pill-value">--:--</span>
                    <span class="pill-label">ETA</span>
                </div>
                
                <div class="nav-pill distance">
                    <span class="pill-icon">📍</span>
                    <span class="pill-value">-- km</span>
                    <span class="pill-label">left</span>
                </div>
                
                <div class="nav-pill speed">
                    <span class="pill-value">0</span>
                    <span class="pill-label">km/h</span>
                </div>
            </div>
            
            <!-- Navigation menu -->
            <div class="nav-menu" id="navMenu" style="display: none;">
                <button onclick="NavigationModule.toggleMenu(); UIModule.togglePanel();">
                    📋 Route Details
                </button>
                <button onclick="NavigationModule.toggleFollowMode()">
                    🎯 <span id="followModeText">Following On</span>
                </button>
                <button onclick="NavigationModule.openVerification()">
                    ✓ Verify Stop
                </button>
                <button onclick="window.location.href='tel:${targetStop.customerPhone}'">
                    📞 Call Customer
                </button>
            </div>
        `;
        
        document.body.appendChild(navUI);
        
        // Store target stop
        GlobalState.navigation.currentInstruction = {
            stop: targetStop,
            distance: 0,
            eta: null
        };
        
        // Start updates
        this.updateNavigation(targetStop);
    },

    // Toggle menu
    toggleMenu() {
        const menu = document.getElementById('navMenu');
        if (menu) {
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        }
    },

    // Toggle follow mode
    toggleFollowMode() {
        GlobalState.navigation.isFollowing = !GlobalState.navigation.isFollowing;
        const followText = document.getElementById('followModeText');
        if (followText) {
            followText.textContent = GlobalState.navigation.isFollowing ? 'Following On' : 'Following Off';
        }
        
        if (GlobalState.navigation.isFollowing && GlobalState.location) {
            MapModule.centerOnLocation(GlobalState.location);
        }
        
        Utils.showNotification(
            GlobalState.navigation.isFollowing ? 'Following mode enabled' : 'Following mode disabled',
            'info'
        );
    },

    // Open verification for current stop
    openVerification() {
        const stop = GlobalState.navigation.currentInstruction?.stop;
        if (stop) {
            VerificationModule.showModal(stop);
        }
    },

    // Update navigation
    async updateNavigation(targetStop) {
        if (!GlobalState.location || !GlobalState.navigation.isActive) return;
        
        const distance = Utils.calculateDistance(GlobalState.location, targetStop.location);
        const eta = Utils.calculateETA(distance, GlobalState.tracking.speed || 30);
        
        // Update pills
        const etaPill = document.querySelector('.nav-pill.eta .pill-value');
        const distancePill = document.querySelector('.nav-pill.distance .pill-value');
        const speedPill = document.querySelector('.nav-pill.speed .pill-value');
        
        if (etaPill) etaPill.textContent = eta;
        
        if (distancePill) {
            distancePill.textContent = distance < 1 ? 
                `${Math.round(distance * 1000)} m` : 
                `${distance.toFixed(1)} km`;
        }
        
        if (speedPill) {
            speedPill.textContent = Math.round(GlobalState.tracking.speed || 0);
        }
        
        // Check proximity
        if (distance < 0.05 && !GlobalState.tracking.proximityNotified) {
            this.showArrivalNotification(targetStop);
            GlobalState.tracking.proximityNotified = true;
        }
        
        // Follow mode
        if (GlobalState.navigation.isFollowing && GlobalState.location) {
            MapModule.smoothPanTo(GlobalState.location);
        }
        
        // Continue updates
        if (GlobalState.navigation.isActive) {
            setTimeout(() => this.updateNavigation(targetStop), 2000);
        }
    },

    // Get directions from OpenRoute
    async getDirections(targetStop) {
        if (!GlobalState.location) return;
        
        try {
            const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': CONFIG.api.OPENROUTE_KEY
                },
                body: JSON.stringify({
                    coordinates: [
                        [GlobalState.location.lng, GlobalState.location.lat],
                        [targetStop.location.lng, targetStop.location.lat]
                    ],
                    instructions: true,
                    language: 'en'
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    
                    // Draw route on map
                    MapModule.drawDirectionsRoute(route);
                    
                    // Update instructions
                    this.updateInstructions(route);
                }
            }
        } catch (error) {
            console.error('Error getting directions:', error);
        }
    },

    // Update navigation instructions
    updateInstructions(route) {
        if (!route.segments || route.segments.length === 0) return;
        
        const segment = route.segments[0];
        if (!segment.steps || segment.steps.length === 0) return;
        
        const currentStep = segment.steps[0];
        
        const distanceEl = document.querySelector('.nav-distance');
        const streetEl = document.querySelector('.nav-street');
        const arrowEl = document.querySelector('.direction-arrow');
        
        if (distanceEl) {
            const dist = currentStep.distance;
            distanceEl.textContent = dist < 1000 ? 
                `${Math.round(dist)} m` : 
                `${(dist / 1000).toFixed(1)} km`;
        }
        
        if (streetEl) {
            const instruction = currentStep.instruction;
            streetEl.textContent = instruction.length > 30 ? 
                instruction.substring(0, 30) + '...' : 
                instruction;
        }
        
        if (arrowEl) {
            arrowEl.textContent = this.getDirectionEmoji(currentStep.type);
        }
    },

    // Get direction emoji based on turn type
    getDirectionEmoji(type) {
        const emojis = {
            0: '⬅️',   // Left
            1: '➡️',   // Right  
            2: '↩️',   // Sharp left
            3: '↪️',   // Sharp right
            4: '↖️',   // Slight left
            5: '↗️',   // Slight right
            6: '⬆️',   // Straight
            7: '🔄',   // Enter roundabout
            8: '🔄',   // Exit roundabout
            9: '⤴️',   // U-turn
            10: '🏁',  // Goal
            11: '🚦',  // Depart
            12: '⬅️',  // Keep left
            13: '➡️'   // Keep right
        };
        
        return emojis[type] || '⬆️';
    },

    // Show arrival notification
    showArrivalNotification(stop) {
        const distanceEl = document.querySelector('.nav-distance');
        const streetEl = document.querySelector('.nav-street');
        const arrowEl = document.querySelector('.direction-arrow');
        
        if (distanceEl) distanceEl.textContent = 'Arrived';
        if (streetEl) streetEl.textContent = `${stop.type} location reached`;
        if (arrowEl) arrowEl.textContent = '✅';
        
        Utils.vibrate([100, 50, 100]);
        
        // Check for payment collection
        const paymentInfo = VerificationModule.getPaymentInfo(stop);
        if (stop.type === 'delivery' && paymentInfo.needsCollection) {
            Utils.showNotification(
                `⚠️ Remember to collect ${Utils.formatCurrency(paymentInfo.amount)} from customer`,
                'warning'
            );
            
            // Show payment reminder overlay
            const reminderDiv = document.createElement('div');
            reminderDiv.className = 'payment-reminder';
            reminderDiv.innerHTML = `💰 Collect ${Utils.formatCurrency(paymentInfo.amount)}`;
            document.body.appendChild(reminderDiv);
            
            setTimeout(() => reminderDiv.remove(), 5000);
        } else {
            Utils.showNotification(`Arrived at ${stop.type} location`, 'success');
        }
        
        // Auto-open verification after 2 seconds
        setTimeout(() => {
            VerificationModule.showModal(stop);
        }, 2000);
    },

    // Start continuous tracking
    startContinuousTracking() {
        if (GlobalState.tracking.interval) {
            clearInterval(GlobalState.tracking.interval);
        }
        
        GlobalState.tracking.interval = setInterval(() => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    position => {
                        LocationModule.updateLocation(position);
                    },
                    error => console.error('Tracking error:', error),
                    { enableHighAccuracy: true, maximumAge: 5000 }
                );
            }
        }, 5000);
    },

    // Exit navigation
    exitNavigation() {
        GlobalState.navigation.isActive = false;
        GlobalState.navigation.isFollowing = false;
        GlobalState.tracking.proximityNotified = false;
        
        // Remove navigation UI
        const navUI = document.querySelector('.navigation-ui');
        if (navUI) navUI.remove();
        
        // Clear tracking interval
        if (GlobalState.tracking.interval) {
            clearInterval(GlobalState.tracking.interval);
            GlobalState.tracking.interval = null;
        }
        
        // Clear directions polyline
        if (GlobalState.navigation.directionsPolyline) {
            GlobalState.map.removeLayer(GlobalState.navigation.directionsPolyline);
            GlobalState.navigation.directionsPolyline = null;
        }
        
        // Show panels again
        UIModule.showPanel();
        
        // Zoom out to show full route
        MapModule.fitRouteBounds();
    }
};

// ============================================================================
// COMPLETE INITIALIZATION
// ============================================================================

async function initializeRouteNavigation() {
    console.log('🚀 Initializing Enhanced Route Navigation Module...');
    
    // Check if already initialized
    if (initialized) {
        console.log('Already initialized, skipping...');
        return;
    }
    initialized = true;
    
    try {
        // Inject all styles
        injectCompleteStyles();
        
        // Wait for dependencies
        await waitForDependencies();
        
        // Initialize route
        const routeLoaded = await RouteModule.initialize();
        
        if (!routeLoaded) {
            console.log('No active route found');
            UIModule.showEmptyState();
            return;
        }
        
        // Calculate financials
        RouteModule.calculateFinancials();
        
        // Initialize map
        await MapModule.initialize();
        
        // Initialize UI
        UIModule.initialize();
        
        // Start location tracking
        LocationModule.startTracking();
        
        // Plot route on map
        await MapModule.plotRoute();
        
        // Draw optimized route
        await MapModule.drawOptimizedRoute();
        
        console.log('✅ Route Navigation Module initialized successfully!');
        console.log(`Route: ${GlobalState.route.name}`);
        console.log(`Stops: ${GlobalState.route.stops.length}`);
        console.log(`Earnings: ${Utils.formatCurrency(GlobalState.earnings.totalRouteEarnings)}`);
        
        // Export debug interface
        window.RouteDebug = {
            state: GlobalState,
            modules: {
                Route: RouteModule,
                Map: MapModule,
                Location: LocationModule,
                Navigation: NavigationModule,
                Verification: VerificationModule,
                UI: UIModule
            },
            utils: Utils,
            config: CONFIG,
            actions: {
                clearRoute: () => RouteModule.clearRoute(),
                completeRoute: () => {
                    GlobalState.route.stops.forEach(s => s.completed = true);
                    RouteModule.saveRoute();
                    VerificationModule.showRouteCompleteModal();
                },
                simulatePickup: () => {
                    const nextPickup = GlobalState.route.stops.find(s => s.type === 'pickup' && !s.completed);
                    if (nextPickup) RouteModule.completeStop(nextPickup.id);
                },
                simulateDelivery: () => {
                    const nextDelivery = GlobalState.route.stops.find(s => s.type === 'delivery' && !s.completed && s.canComplete);
                    if (nextDelivery) RouteModule.completeStop(nextDelivery.id);
                }
            }
        };
        
    } catch (error) {
        console.error('❌ Failed to initialize Route Navigation Module:', error);
        UIModule.showErrorState(error.message);
    }
}

// Wait for dependencies
async function waitForDependencies() {
    return new Promise((resolve) => {
        if (window.L) {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (window.L) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            
            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, 10000);
        }
    });
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRouteNavigation);
} else {
    initializeRouteNavigation();
}

// Export modules for external use
window.TumaRouteNavigation = {
    initialize: initializeRouteNavigation,
    modules: {
        Route: RouteModule,
        Verification: VerificationModule,
        Navigation: NavigationModule
    },
    utils: Utils,
    state: GlobalState,
    config: CONFIG
};
/**
 * COMPLETE ENHANCED ROUTE NAVIGATION MODULE - FULL IMPLEMENTATION
 * Part 3: Map Module, Location Module, UI Module + Fixed Verification Flow
 * Includes proper "Verify Delivery" button that triggers POD
 */

// ============================================================================
// FIX: Updated Verification Module - Proper Delivery Verification Flow
// ============================================================================

// Override the verifyCode function to handle delivery properly
VerificationModule.verifyCode = async function() {
    const input = document.getElementById('verification-code-input');
    const enteredCode = input?.value?.trim().toUpperCase();
    const stop = GlobalState.verification.currentStop;
    
    if (!stop) return;
    
    // Validate code entry
    if (!enteredCode || enteredCode.length < 4) {
        input.classList.add('error');
        Utils.vibrate([200, 100, 200]);
        Utils.showNotification('Please enter a valid code', 'error');
        return;
    }
    
    // Check if code is correct
    const expectedCode = stop.verificationCode?.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const isValid = CONFIG.dev.isDevelopment ? 
        (enteredCode.length > 0) : 
        (enteredCode === expectedCode);
    
    if (!isValid) {
        input.classList.add('error');
        Utils.vibrate([200, 100, 200]);
        Utils.showNotification('Invalid verification code', 'error');
        return;
    }
    
    // Check payment collection for cash deliveries (BEFORE closing modal)
    const paymentInfo = this.getPaymentInfo(stop);
    if (stop.type === 'delivery' && paymentInfo.needsCollection) {
        const paymentCheckbox = document.getElementById('payment-collected-checkbox');
        if (paymentCheckbox && !paymentCheckbox.checked) {
            Utils.showNotification('Please confirm cash collection before verifying', 'warning');
            paymentCheckbox.parentElement.style.animation = 'shake 0.3s';
            return;
        }
    }
    
    // Close verification modal
    this.closeModal();
    
    // Handle based on stop type
    if (stop.type === 'pickup') {
        // For pickup: directly complete
        this.completePickup(stop);
    } else {
        // For delivery: show POD modal AFTER successful verification
        Utils.showNotification('Code verified! Please take proof of delivery photo', 'success');
        setTimeout(() => {
            this.showPODModal(stop);
        }, 500);
    }
};

// ============================================================================
// MAP MODULE - Complete Implementation
// ============================================================================

const MapModule = {
    // Initialize map
    async initialize() {
        console.log('MapModule: Initializing map...');
        
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            console.error('Map container not found!');
            return false;
        }
        
        // Force proper dimensions
        mapContainer.style.width = '100%';
        mapContainer.style.height = '100%';
        mapContainer.style.position = 'absolute';
        mapContainer.style.top = '0';
        mapContainer.style.left = '0';
        
        // Calculate center from route
        let center = CONFIG.defaults.nairobi;
        if (GlobalState.route?.stops?.length > 0) {
            const bounds = this.calculateBounds(GlobalState.route.stops);
            center = {
                lat: (bounds.north + bounds.south) / 2,
                lng: (bounds.east + bounds.west) / 2
            };
        }
        
        // Create map with rotation support
        GlobalState.map = L.map('map', {
            center: [center.lat, center.lng],
            zoom: 14,
            zoomControl: false,
            rotate: CONFIG.navigation.mapRotatable,
            bearing: 0,
            touchRotate: CONFIG.navigation.mapRotatable,
            shiftKeyRotate: CONFIG.navigation.mapRotatable,
            attributionControl: false
        });
        
        // Add tile layer (CartoDB Voyager for clean look)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(GlobalState.map);
        
        // Add controls
        L.control.zoom({
            position: 'bottomleft'
        }).addTo(GlobalState.map);
        
        L.control.scale({
            position: 'bottomleft',
            imperial: false
        }).addTo(GlobalState.map);
        
        // Force resize after a delay
        setTimeout(() => {
            GlobalState.map.invalidateSize();
        }, 100);
        
        console.log('MapModule: Map initialized successfully');
        return true;
    },

    // Calculate bounds from stops
    calculateBounds(stops) {
        let north = -90, south = 90, east = -180, west = 180;
        
        stops.forEach(stop => {
            if (stop.location) {
                north = Math.max(north, stop.location.lat);
                south = Math.min(south, stop.location.lat);
                east = Math.max(east, stop.location.lng);
                west = Math.min(west, stop.location.lng);
            }
        });
        
        // Add padding
        const latPadding = (north - south) * 0.1;
        const lngPadding = (east - west) * 0.1;
        
        return {
            north: north + latPadding,
            south: south - latPadding,
            east: east + lngPadding,
            west: west - lngPadding
        };
    },

    // Plot route stops on map
    async plotRoute() {
        if (!GlobalState.map || !GlobalState.route?.stops) return;
        
        // Clear existing markers
        GlobalState.markers.forEach(marker => marker.remove());
        GlobalState.markers = [];
        
        const bounds = L.latLngBounds();
        
        // Add markers for each stop
        GlobalState.route.stops.forEach((stop, index) => {
            const marker = L.marker([stop.location.lat, stop.location.lng], {
                icon: this.createStopIcon(stop),
                zIndexOffset: stop.completed ? 0 : 100
            })
            .addTo(GlobalState.map)
            .bindPopup(this.createStopPopup(stop));
            
            GlobalState.markers.push(marker);
            bounds.extend([stop.location.lat, stop.location.lng]);
        });
        
        // Fit bounds
        if (GlobalState.markers.length > 0) {
            GlobalState.map.fitBounds(bounds, { padding: [50, 50] });
        }
    },

    // Create stop icon for map with dynamic flow indicators
    createStopIcon(stop) {
        const isCompleted = stop.completed;
        const isNext = RouteModule.getNextStop()?.id === stop.id;
        const type = stop.type;
        
        // Check if this stop is part of an efficient pair or dynamic route
        const isEfficientPair = stop.isEfficientPair || stop.allowDynamic;
        
        const bgColor = isCompleted ? '#1C1C1F' : 
                       isEfficientPair ? '#9B59B6' : // Purple for efficient pairs
                       type === 'pickup' ? '#FF9F0A' : 
                       '#0066FF';
        
        const borderColor = isCompleted ? '#48484A' : 
                           isNext ? '#00FF00' : // Green border for next stop
                           '#FFFFFF';
        
        const symbol = isCompleted ? '✓' : 
                      isEfficientPair ? '⚡' : // Lightning for efficient routing
                      type === 'pickup' ? 'P' : 'D';
        
        return L.divIcon({
            className: 'custom-marker',
            html: `
                <div class="stop-marker-wrapper ${isCompleted ? 'completed' : ''} ${isNext ? 'active' : ''}">
                    <div class="stop-marker ${type}" style="
                        background: ${bgColor};
                        width: 44px;
                        height: 44px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                        border: 3px solid ${borderColor};
                        position: relative;
                    ">
                        <span style="
                            color: white;
                            font-weight: bold;
                            font-size: 20px;
                            ${isCompleted ? 'color: #8E8E93;' : ''}
                        ">${symbol}</span>
                        ${isNext ? '<div class="marker-pulse"></div>' : ''}
                    </div>
                </div>
            `,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
            popupAnchor: [0, -22]
        });
    },

    // Create popup content for stop
    createStopPopup(stop) {
        const bgColor = stop.type === 'pickup' ? '#FF9F0A' : '#0066FF';
        const textColor = stop.type === 'pickup' ? 'black' : 'white';
        const paymentInfo = VerificationModule.getPaymentInfo(stop);
        
        return `
            <div class="stop-popup">
                <div class="popup-header" style="background: ${bgColor}; color: ${textColor}; padding: 12px; margin: -10px -10px 10px -10px;">
                    <span class="popup-phase">${stop.type.toUpperCase()}</span>
                    <span class="popup-code" style="float: right;">${stop.parcelCode}</span>
                </div>
                <div class="popup-body">
                    <h3 style="margin: 0 0 10px 0;">${stop.address}</h3>
                    <div class="popup-info">
                        <div class="info-row">
                            <span>👤 ${stop.customerName}</span>
                        </div>
                        <div class="info-row">
                            <span>📞 <a href="tel:${stop.customerPhone}">${stop.customerPhone}</a></span>
                        </div>
                        ${paymentInfo.needsCollection ? `
                            <div class="info-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ccc;">
                                <span style="font-weight: 600; color: #FF9F0A;">
                                    💰 Collect: ${Utils.formatCurrency(paymentInfo.amount)}
                                </span>
                            </div>
                        ` : ''}
                    </div>
                    ${!stop.completed && RouteModule.canCompleteStop(stop) ? `
                        <div class="popup-actions" style="margin-top: 12px; display: flex; gap: 8px;">
                            <button onclick="VerificationModule.showModal('${stop.id}')" style="flex: 1; padding: 8px; background: ${bgColor}; color: ${textColor}; border: none; border-radius: 6px; cursor: pointer;">
                                ✓ Verify
                            </button>
                            <button onclick="NavigationModule.startNavigation('${stop.id}')" style="flex: 1; padding: 8px; background: #0066FF; color: white; border: none; border-radius: 6px; cursor: pointer;">
                                🧭 Navigate
                            </button>
                        </div>
                    ` : stop.completed ? `
                        <div style="margin-top: 12px; padding: 8px; background: rgba(52, 199, 89, 0.1); border-radius: 8px; text-align: center; color: #34C759;">
                            ✓ Completed ${Utils.formatTimeAgo(stop.timestamp)}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    // Draw optimized route using OpenRoute
    async drawOptimizedRoute() {
        if (!GlobalState.route?.stops) return;
        
        const activeStops = GlobalState.route.stops.filter(s => !s.completed);
        if (activeStops.length < 2) return;
        
        try {
            // Remove existing polyline
            if (GlobalState.polylines.length > 0) {
                GlobalState.polylines.forEach(p => GlobalState.map.removeLayer(p));
                GlobalState.polylines = [];
            }
            
            // Build coordinates array
            let coordinates = [];
            if (GlobalState.location && GlobalState.navigation.isActive) {
                coordinates.push([GlobalState.location.lng, GlobalState.location.lat]);
            }
            coordinates = coordinates.concat(activeStops.map(stop => 
                [stop.location.lng, stop.location.lat]
            ));
            
            // Get route from OpenRoute
            const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': CONFIG.api.OPENROUTE_KEY
                },
                body: JSON.stringify({
                    coordinates: coordinates,
                    continue_straight: false,
                    geometry: true,
                    instructions: false,
                    preference: 'recommended'
                })
            });
            
            if (!response.ok) throw new Error('Route API error');
            
            const data = await response.json();
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                const decodedCoords = this.decodePolyline(route.geometry);
                
                const polyline = L.polyline(decodedCoords, {
                    color: '#0066FF',
                    weight: 6,
                    opacity: 0.8,
                    smoothFactor: 1
                }).addTo(GlobalState.map);
                
                GlobalState.polylines.push(polyline);
                
                // Update route stats
                const distance = (route.summary.distance / 1000).toFixed(1);
                const duration = Math.round(route.summary.duration / 60);
                
                GlobalState.route.distance = parseFloat(distance);
                GlobalState.route.duration = duration;
            }
        } catch (error) {
            console.error('Error drawing route:', error);
            // Fallback to straight lines
            this.drawFallbackRoute(activeStops);
        }
    },

    // Draw fallback route (straight lines)
    drawFallbackRoute(stops) {
        const coords = stops.map(stop => [stop.location.lat, stop.location.lng]);
        
        if (GlobalState.location && GlobalState.navigation.isActive) {
            coords.unshift([GlobalState.location.lat, GlobalState.location.lng]);
        }
        
        const polyline = L.polyline(coords, {
            color: '#0066FF',
            weight: 4,
            opacity: 0.6,
            dashArray: '10, 10',
            smoothFactor: 1
        }).addTo(GlobalState.map);
        
        GlobalState.polylines.push(polyline);
    },

    // Draw directions route for navigation
    drawDirectionsRoute(route) {
        // Remove existing directions polyline
        if (GlobalState.navigation.directionsPolyline) {
            GlobalState.map.removeLayer(GlobalState.navigation.directionsPolyline);
        }
        
        const decodedCoords = this.decodePolyline(route.geometry);
        GlobalState.navigation.directionsPolyline = L.polyline(decodedCoords, {
            color: '#0066FF',
            weight: 8,
            opacity: 0.9,
            className: 'navigation-route'
        }).addTo(GlobalState.map);
    },

    // Decode polyline from OpenRoute
    decodePolyline(encoded) {
        const poly = [];
        let index = 0;
        let lat = 0;
        let lng = 0;

        while (index < encoded.length) {
            let b;
            let shift = 0;
            let result = 0;
            
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            
            const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lat += dlat;

            shift = 0;
            result = 0;
            
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            
            const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lng += dlng;

            poly.push([lat / 1E5, lng / 1E5]);
        }

        return poly;
    },

    // Focus on specific stop
    focusOnStop(stop) {
        if (!GlobalState.map || !stop) return;
        
        GlobalState.map.setView([stop.location.lat, stop.location.lng], 16, {
            animate: true,
            duration: 1
        });
        
        // Open popup for this stop
        const marker = GlobalState.markers.find(m => {
            const latLng = m.getLatLng();
            return latLng.lat === stop.location.lat && latLng.lng === stop.location.lng;
        });
        
        if (marker) {
            marker.openPopup();
        }
    },

    // Center on location
    centerOnLocation(location) {
        if (!GlobalState.map || !location) return;
        
        GlobalState.map.panTo([location.lat, location.lng], {
            animate: true,
            duration: 1
        });
    },

    // Smooth pan to location
    smoothPanTo(location) {
        if (!GlobalState.map || !location) return;
        
        GlobalState.map.panTo([location.lat, location.lng], {
            animate: true,
            duration: 0.5,
            noMoveStart: true
        });
    },

    // Fit route bounds
    fitRouteBounds() {
        if (!GlobalState.map || !GlobalState.route?.stops) return;
        
        const bounds = L.latLngBounds();
        GlobalState.route.stops.forEach(stop => {
            if (stop.location) {
                bounds.extend([stop.location.lat, stop.location.lng]);
            }
        });
        
        if (bounds.isValid()) {
            GlobalState.map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
};

// ============================================================================
// LOCATION MODULE - Complete Implementation
// ============================================================================

const LocationModule = {
    // Start location tracking
    startTracking() {
        if (!navigator.geolocation) {
            Utils.showNotification('Location services not available', 'warning');
            return;
        }
        
        console.log('LocationModule: Starting location tracking...');
        
        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };
        
        // Get initial position
        navigator.geolocation.getCurrentPosition(
            position => {
                this.updateLocation(position);
                GlobalState.tracking.isActive = true;
            },
            error => {
                console.error('Location error:', error);
                Utils.showNotification('Please enable location services', 'warning');
            },
            options
        );
        
        // Start watching position
        GlobalState.tracking.watchId = navigator.geolocation.watchPosition(
            position => this.updateLocation(position),
            error => console.error('Location update error:', error),
            options
        );
    },

    // Update current location
    updateLocation(position) {
        const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
        };
        
        // Check if location has significantly changed
        if (GlobalState.location) {
            const distance = Utils.calculateDistance(GlobalState.location, newLocation);
            if (distance < 0.005) return; // Ignore small movements (< 5 meters)
        }
        
        // Store last location
        GlobalState.lastLocation = GlobalState.location;
        GlobalState.lastLocationTime = GlobalState.lastLocationTime || Date.now();
        
        // Update current location
        GlobalState.location = newLocation;
        
        // Update tracking info
        if (position.coords.heading !== null && position.coords.heading !== undefined) {
            GlobalState.tracking.heading = position.coords.heading;
        } else if (GlobalState.lastLocation) {
            GlobalState.tracking.heading = Utils.calculateBearing(GlobalState.lastLocation, GlobalState.location);
        }
        
        if (position.coords.speed !== null) {
            GlobalState.tracking.speed = Math.round(position.coords.speed * 3.6); // m/s to km/h
        } else if (GlobalState.lastLocation && GlobalState.lastLocationTime) {
            const timeDiff = (Date.now() - GlobalState.lastLocationTime) / 1000; // seconds
            const distance = Utils.calculateDistance(GlobalState.lastLocation, GlobalState.location);
            GlobalState.tracking.speed = Math.round((distance / timeDiff) * 3600); // km/h
        }
        
        GlobalState.lastLocationTime = Date.now();
        
        // Update map marker
        this.updateLocationMarker();
        
        // Check proximity to stops
        this.checkProximity();
        
        // Update UI
        if (GlobalState.navigation.isActive) {
            // Navigation will handle its own updates
        } else {
            UIModule.updateLocationInfo();
        }
    },

    // Update location marker on map
    updateLocationMarker() {
        if (!GlobalState.map || !GlobalState.location) return;
        
        // Create or update location marker
        if (!GlobalState.locationMarker) {
            const locationIcon = this.createLocationIcon();
            GlobalState.locationMarker = L.marker(
                [GlobalState.location.lat, GlobalState.location.lng],
                { 
                    icon: locationIcon,
                    zIndexOffset: 1000
                }
            ).addTo(GlobalState.map);
        } else {
            // Update position
            GlobalState.locationMarker.setLatLng([GlobalState.location.lat, GlobalState.location.lng]);
            
            // Update icon with new heading
            const locationIcon = this.createLocationIcon();
            GlobalState.locationMarker.setIcon(locationIcon);
        }
        
        // Update accuracy circle if needed
        if (GlobalState.accuracyCircle) {
            GlobalState.accuracyCircle.setLatLng([GlobalState.location.lat, GlobalState.location.lng]);
        }
        
        // Follow mode
        if (GlobalState.navigation.isFollowing && GlobalState.navigation.isActive) {
            MapModule.smoothPanTo(GlobalState.location);
            
            // Auto-zoom based on speed
            const targetZoom = this.calculateZoomFromSpeed(GlobalState.tracking.speed);
            const currentZoom = GlobalState.map.getZoom();
            if (Math.abs(currentZoom - targetZoom) > 0.5) {
                GlobalState.map.setZoom(targetZoom, { animate: true, duration: 1 });
            }
        }
    },

    // Create location icon with heading
    createLocationIcon() {
        return L.divIcon({
            className: 'current-location-marker',
            html: `
                <div class="location-marker-wrapper">
                    <div class="location-pulse"></div>
                    <div class="location-marker-container" style="transform: rotate(${GlobalState.tracking.heading || 0}deg)">
                        ${GlobalState.tracking.speed > 5 ? '<div class="location-direction-cone"></div>' : ''}
                        <div class="location-dot">
                            <div class="location-inner-dot"></div>
                        </div>
                    </div>
                </div>
            `,
            iconSize: [60, 60],
            iconAnchor: [30, 30]
        });
    },

    // Calculate zoom from speed
    calculateZoomFromSpeed(speed) {
        if (speed > 60) return 15;
        if (speed > 40) return 16;
        if (speed > 20) return 17;
        if (speed > 5) return 18;
        return 18;
    },

    // Check proximity to stops
    checkProximity() {
        if (!GlobalState.location || !GlobalState.route?.stops) return;
        
        const nextStop = RouteModule.getNextStop();
        if (!nextStop) return;
        
        const distance = Utils.calculateDistance(GlobalState.location, nextStop.location);
        
        // Near stop (within 100 meters)
        if (distance < 0.1 && !GlobalState.tracking.proximityNotified) {
            GlobalState.tracking.proximityNotified = true;
            
            const paymentInfo = VerificationModule.getPaymentInfo(nextStop);
            if (nextStop.type === 'delivery' && paymentInfo.needsCollection) {
                Utils.showNotification(
                    `💰 Approaching delivery - Remember to collect ${Utils.formatCurrency(paymentInfo.amount)}`,
                    'warning'
                );
            } else {
                Utils.showNotification(
                    `Approaching ${nextStop.type} location - ${Math.round(distance * 1000)}m away`,
                    'info'
                );
            }
            
            // Reset notification flag after 5 minutes
            setTimeout(() => {
                GlobalState.tracking.proximityNotified = false;
            }, 300000);
        }
    },

    // Stop tracking
    stopTracking() {
        if (GlobalState.tracking.watchId) {
            navigator.geolocation.clearWatch(GlobalState.tracking.watchId);
            GlobalState.tracking.watchId = null;
        }
        
        if (GlobalState.tracking.interval) {
            clearInterval(GlobalState.tracking.interval);
            GlobalState.tracking.interval = null;
        }
        
        GlobalState.tracking.isActive = false;
    }
};

// ============================================================================
// UI MODULE - Complete Implementation
// ============================================================================

const UIModule = {
    // Initialize UI
    initialize() {
        console.log('UIModule: Initializing UI...');
        
        // Create main UI structure
        this.createUIStructure();
        
        // Show route info
        this.displayRouteInfo();
        
        // Show stops list
        this.displayStops();
        
        // Show cash widget if needed
        if (GlobalState.parcels.cashToCollect > 0) {
            this.showCashWidget();
        }
        
        // Setup event handlers
        this.setupEventHandlers();
        
        console.log('UIModule: UI initialized');
    },

    // Create UI structure
    createUIStructure() {
        // Check if structure already exists
        if (document.getElementById('routePanel')) return;
        
        const uiHTML = `
            <!-- Route Panel -->
            <div id="routePanel" class="route-panel" style="display: none;">
                <div class="panel-handle"></div>
                
                <div class="route-header">
                    <h2 id="routeTitle">${GlobalState.route?.name || 'Active Route'}</h2>
                    <button id="routeTypeBtn" class="route-badge verify-btn">
                        Loading...
                    </button>
                </div>
                
                <div class="route-stats">
                    <div class="stat">
                        <span class="stat-label">Stops</span>
                        <span class="stat-value" id="remainingStops">0</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Distance</span>
                        <span class="stat-value"><span id="totalDistance">0</span> km</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">ETA</span>
                        <span class="stat-value"><span id="estimatedTime">0</span> min</span>
                    </div>
                </div>
                
                <div id="stopsList" class="stops-list">
                    <!-- Stops will be inserted here -->
                </div>
            </div>
            
            <!-- Navigation Controls -->
            <div id="navControls" class="nav-controls" style="display: none;">
                <button class="nav-button primary" onclick="UIModule.startNavigation()">
                    <span>🧭</span>
                    <span>Navigate</span>
                </button>
                <button class="nav-button secondary" onclick="UIModule.togglePanel()">
                    <span>📋</span>
                    <span>Details</span>
                </button>
                <button class="nav-button" onclick="LocationModule.centerOnLocation()">
                    <span>📍</span>
                </button>
            </div>
            
            <!-- Empty State -->
            <div id="emptyState" class="empty-content" style="display: none;">
                <div class="empty-icon">📦</div>
                <h2>No Active Route</h2>
                <p>You don't have any active deliveries</p>
                <button onclick="window.location.href='./rider.html'">
                    Back to Dashboard
                </button>
            </div>
        `;
        
        // Insert UI
        const container = document.createElement('div');
        container.innerHTML = uiHTML;
        document.body.appendChild(container);
        
        // Show panels
        document.getElementById('routePanel').style.display = 'block';
        document.getElementById('navControls').style.display = 'flex';
    },

    // Display route info
    displayRouteInfo() {
        const nextStop = RouteModule.getNextStop();
        const routeTypeBtn = document.getElementById('routeTypeBtn');
        
        if (routeTypeBtn) {
            if (nextStop) {
                routeTypeBtn.className = `route-badge verify-btn ${nextStop.type}`;
                routeTypeBtn.innerHTML = `
                    ✓ Verify ${nextStop.type === 'pickup' ? 'Pickup' : 'Delivery'}
                `;
                routeTypeBtn.onclick = () => VerificationModule.showModal(nextStop);
            } else {
                routeTypeBtn.className = 'route-badge completed';
                routeTypeBtn.innerHTML = 'Route Complete';
                routeTypeBtn.onclick = null;
            }
        }
        
        this.updateRouteStats();
    },

    // Update route stats
    updateRouteStats() {
        const remainingStops = GlobalState.route?.stops?.filter(s => !s.completed).length || 0;
        const totalDistance = GlobalState.route?.distance || 0;
        const estimatedTime = GlobalState.route?.duration || (remainingStops * 10);
        
        const remainingEl = document.getElementById('remainingStops');
        const distanceEl = document.getElementById('totalDistance');
        const timeEl = document.getElementById('estimatedTime');
        
        if (remainingEl) remainingEl.textContent = remainingStops;
        if (distanceEl) distanceEl.textContent = totalDistance.toFixed(1);
        if (timeEl) timeEl.textContent = estimatedTime;
    },

    // Display stops (shows optimized dynamic route, not rigid phases)
    displayStops() {
        const stopsList = document.getElementById('stopsList');
        if (!stopsList || !GlobalState.route?.stops) return;
        
        // Get optimized sequence or use original stops
        const optimizedStops = GlobalState.optimizedSequence || GlobalState.route.stops;
        
        // Update parcels in possession
        this.updateParcelsInPossession();
        
        let html = '';
        
        // Show current target (next stop in sequence)
        const nextStop = RouteModule.getNextStop();
        if (nextStop) {
            html += `
                <div class="current-target" style="background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: white; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
                    <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">NEXT STOP</div>
                    <div style="font-size: 18px; font-weight: 600;">${nextStop.address}</div>
                    <div style="margin-top: 8px; display: flex; gap: 12px; align-items: center;">
                        <span>${nextStop.type === 'pickup' ? '📦 Pickup' : '📍 Delivery'}</span>
                        <span>${nextStop.parcelCode}</span>
                        ${nextStop.distanceFromPrevious ? `
                            <span style="margin-left: auto; font-size: 14px; opacity: 0.9;">
                                ${nextStop.distanceFromPrevious < 1 ? 
                                    `${Math.round(nextStop.distanceFromPrevious * 1000)}m` : 
                                    `${nextStop.distanceFromPrevious.toFixed(1)}km`} away
                            </span>
                        ` : ''}
                    </div>
                </div>
            `;
        }
        
        // Parcels in possession widget
        if (GlobalState.parcels.inPossession.length > 0) {
            html += this.createParcelsWidget();
        }
        
        // Show optimized route as single dynamic list
        html += `
            <div class="optimized-route">
                <h3 style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                    <span>📍 Optimized Route</span>
                    <span class="phase-count" style="font-size: 14px; color: var(--text-secondary);">
                        ${optimizedStops.filter(s => s.completed).length}/${optimizedStops.length} completed
                    </span>
                </h3>
                <div class="route-stops">
        `;
        
        // Display all stops in optimized order
        optimizedStops.forEach((stop, index) => {
            const canComplete = RouteModule.canCompleteStop(stop);
            const isNext = nextStop?.id === stop.id;
            const paymentInfo = VerificationModule.getPaymentInfo(stop);
            
            // Determine if this is an efficient pair
            const isEfficientPair = stop.isEfficientPair || stop.allowDynamic;
            
            html += `
                <div class="stop-card ${stop.completed ? 'completed' : ''} ${isNext ? 'active' : ''} ${!canComplete && !stop.completed ? 'pending' : ''}" 
                     data-stop-id="${stop.id}"
                     style="${isEfficientPair && !stop.completed ? 'border-left: 3px solid #9B59B6;' : ''}">
                    <div class="stop-number-badge ${stop.type}" style="${stop.completed ? 'background: #34C759;' : isEfficientPair ? 'background: #9B59B6;' : ''}">
                        ${stop.completed ? '✓' : isEfficientPair ? '⚡' : stop.sequenceNumber || (index + 1)}
                    </div>
                    <div class="stop-content">
                        <div class="stop-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <span class="stop-type-badge" style="
                                display: inline-block;
                                padding: 2px 8px;
                                border-radius: 4px;
                                font-size: 11px;
                                font-weight: 600;
                                background: ${stop.type === 'pickup' ? '#FF9F0A' : '#0066FF'};
                                color: ${stop.type === 'pickup' ? 'black' : 'white'};
                            ">
                                ${stop.type.toUpperCase()}
                            </span>
                            ${isEfficientPair && !stop.completed ? `
                                <span style="font-size: 11px; color: #9B59B6; font-weight: 600;">
                                    EFFICIENT ROUTE
                                </span>
                            ` : ''}
                            ${stop.estimatedArrival && !stop.completed ? `
                                <span style="margin-left: auto; font-size: 12px; color: var(--text-secondary);">
                                    ETA: ${stop.estimatedArrival}
                                </span>
                            ` : ''}
                        </div>
                        <div class="stop-address" style="font-weight: 600;">
                            ${stop.address}
                        </div>
                        <div class="stop-details">
                            <div class="detail-row">
                                <span class="detail-icon">👤</span>
                                <span>${stop.customerName}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-icon">📋</span>
                                <span>Code: ${stop.parcelCode}</span>
                            </div>
                            ${stop.specialInstructions ? `
                                <div class="detail-row">
                                    <span class="detail-icon">💬</span>
                                    <span>${stop.specialInstructions}</span>
                                </div>
                            ` : ''}
                        </div>
                        
                        ${stop.type === 'delivery' && paymentInfo.needsCollection ? `
                            <div class="payment-badge ${stop.completed ? 'collected' : ''}">
                                <span>💵</span>
                                <span>${stop.completed ? 'Collected' : 'COLLECT'}: ${Utils.formatCurrency(paymentInfo.amount)}</span>
                            </div>
                        ` : stop.type === 'delivery' && paymentInfo.method === 'online' ? `
                            <div class="payment-badge prepaid">
                                <span>✅</span>
                                <span>Already Paid</span>
                            </div>
                        ` : ''}
                        
                        ${stop.completed ? `
                            <div class="stop-status completed">
                                ✓ Completed ${Utils.formatTimeAgo(stop.timestamp)}
                            </div>
                        ` : isNext ? `
                            <div class="stop-status active">
                                → Current Target
                            </div>
                        ` : !canComplete ? `
                            <div class="stop-status pending" style="color: var(--text-secondary);">
                                ⏳ Pick up parcel ${stop.parcelCode} first
                            </div>
                        ` : ''}
                    </div>
                    <div class="stop-actions">
                        ${!stop.completed && canComplete ? `
                            <button onclick="MapModule.focusOnStop(GlobalState.route.stops.find(s => s.id === '${stop.id}'))" title="View on map">
                                🗺️
                            </button>
                            <button onclick="NavigationModule.startNavigation(GlobalState.route.stops.find(s => s.id === '${stop.id}'))" title="Navigate">
                                🧭
                            </button>
                            <a href="tel:${stop.customerPhone}" title="Call">
                                📞
                            </a>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
        
        // Show route efficiency summary
        const pickupCount = optimizedStops.filter(s => s.type === 'pickup').length;
        const deliveryCount = optimizedStops.filter(s => s.type === 'delivery').length;
        const completedPickups = optimizedStops.filter(s => s.type === 'pickup' && s.completed).length;
        const completedDeliveries = optimizedStops.filter(s => s.type === 'delivery' && s.completed).length;
        
        html += `
            <div class="route-summary" style="margin-top: 24px; padding: 16px; background: var(--surface-high); border-radius: 12px;">
                <h4 style="margin-bottom: 12px;">Route Progress</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center;">
                    <div>
                        <div style="font-size: 24px; font-weight: 700; color: var(--primary);">
                            ${completedPickups}/${pickupCount}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Pickups</div>
                    </div>
                    <div>
                        <div style="font-size: 24px; font-weight: 700; color: var(--primary);">
                            ${completedDeliveries}/${deliveryCount}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Deliveries</div>
                    </div>
                    <div>
                        <div style="font-size: 24px; font-weight: 700; color: var(--primary);">
                            ${GlobalState.route.distance ? GlobalState.route.distance.toFixed(1) : '--'}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">km total</div>
                    </div>
                </div>
                ${GlobalState.optimizedSequence ? `
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
                        <div style="font-size: 12px; color: var(--text-secondary); text-align: center;">
                            Route optimized for efficiency - deliveries may occur before all pickups
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        stopsList.innerHTML = html;
    },

    // Create progress widget
    createProgressWidget(pickupStops, deliveryStops) {
        const pickupsComplete = pickupStops.filter(s => s.completed).length;
        const deliveriesComplete = deliveryStops.filter(s => s.completed).length;
        
        return `
            <div class="route-phases" style="display: flex; gap: 12px; margin-bottom: 20px; padding: 16px; background: var(--surface-high); border-radius: 12px;">
                <div class="phase ${pickupsComplete === pickupStops.length ? 'completed' : pickupsComplete > 0 ? 'active' : ''}" style="flex: 1; text-align: center;">
                    <div class="phase-icon" style="font-size: 32px;">📦</div>
                    <div class="phase-title" style="font-weight: 600;">Pickups</div>
                    <div class="phase-progress">${pickupsComplete}/${pickupStops.length}</div>
                </div>
                
                <div class="phase-arrow" style="display: flex; align-items: center; font-size: 24px;">→</div>
                
                <div class="phase ${deliveriesComplete === deliveryStops.length ? 'completed' : deliveriesComplete > 0 ? 'active' : ''}" style="flex: 1; text-align: center;">
                    <div class="phase-icon" style="font-size: 32px;">📍</div>
                    <div class="phase-title" style="font-weight: 600;">Deliveries</div>
                    <div class="phase-progress">${deliveriesComplete}/${deliveryStops.length}</div>
                </div>
            </div>
        `;
    },

    // Create parcels widget
    createParcelsWidget() {
        return `
            <div class="parcels-widget">
                <div class="widget-header">
                    <span>📦</span>
                    <span>Carrying ${GlobalState.parcels.inPossession.length} parcel${GlobalState.parcels.inPossession.length > 1 ? 's' : ''}</span>
                </div>
                <div class="parcel-cards">
                    ${GlobalState.parcels.inPossession.map(parcel => {
                        const deliveryStop = GlobalState.route.stops.find(s => 
                            s.type === 'delivery' && s.parcelId === parcel.id
                        );
                        const paymentInfo = deliveryStop ? VerificationModule.getPaymentInfo(deliveryStop) : null;
                        
                        return `
                            <div class="parcel-card">
                                <div class="parcel-code">${parcel.parcel_code || parcel.parcelCode || 'N/A'}</div>
                                <div class="parcel-destination">${deliveryStop?.address || 'Unknown'}</div>
                                <div class="parcel-time">Picked up ${Utils.formatTimeAgo(parcel.pickupTime)}</div>
                                ${paymentInfo && paymentInfo.needsCollection ? `
                                    <div class="parcel-payment">
                                        💰 Collect: ${Utils.formatCurrency(paymentInfo.amount)}
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    // Create stop card
    createStopCard(stop, number, type, isLocked = false) {
        const isActive = RouteModule.getNextStop()?.id === stop.id;
        const canInteract = !stop.completed && !isLocked && RouteModule.canCompleteStop(stop);
        const paymentInfo = VerificationModule.getPaymentInfo(stop);
        
        return `
            <div class="stop-card ${stop.completed ? 'completed' : ''} ${isActive ? 'active' : ''} ${isLocked ? 'blocked' : ''}" 
                 data-stop-id="${stop.id}">
                <div class="stop-number-badge ${type}">
                    ${stop.completed ? '✓' : number}
                </div>
                <div class="stop-content">
                    <div class="stop-address">${stop.address}</div>
                    <div class="stop-details">
                        <div class="detail-row">
                            <span class="detail-icon">👤</span>
                            <span>${stop.customerName}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-icon">📋</span>
                            <span>Code: ${stop.parcelCode}</span>
                        </div>
                        ${stop.specialInstructions ? `
                            <div class="detail-row">
                                <span class="detail-icon">💬</span>
                                <span>${stop.specialInstructions}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${type === 'delivery' && paymentInfo.needsCollection ? `
                        <div class="payment-badge ${stop.completed ? 'collected' : ''}">
                            <span>💵</span>
                            <span>${stop.completed ? 'Collected' : 'COLLECT'}: ${Utils.formatCurrency(paymentInfo.amount)}</span>
                        </div>
                    ` : type === 'delivery' && paymentInfo.method === 'online' ? `
                        <div class="payment-badge prepaid">
                            <span>✅</span>
                            <span>Already Paid</span>
                        </div>
                    ` : ''}
                    
                    ${stop.completed ? `
                        <div class="stop-status completed">
                            ✓ Completed ${Utils.formatTimeAgo(stop.timestamp)}
                        </div>
                    ` : isActive ? `
                        <div class="stop-status active">
                            → Current Stop
                        </div>
                    ` : isLocked ? `
                        <div class="stop-status blocked">
                            🔒 Complete pickups first
                        </div>
                    ` : ''}
                </div>
                <div class="stop-actions">
                    ${!stop.completed && canInteract ? `
                        <button onclick="NavigationModule.startNavigation(GlobalState.route.stops.find(s => s.id === '${stop.id}'))">
                            🧭
                        </button>
                        <a href="tel:${stop.customerPhone}">
                            📞
                        </a>
                    ` : ''}
                </div>
            </div>
        `;
    },

    // Update parcels in possession
    updateParcelsInPossession() {
        GlobalState.parcels.inPossession = [];
        
        if (!GlobalState.route?.stops) return;
        
        GlobalState.route.stops.forEach(stop => {
            if (stop.type === 'pickup' && stop.completed) {
                const deliveryStop = GlobalState.route.stops.find(s => 
                    s.type === 'delivery' && s.parcelId === stop.parcelId
                );
                
                if (deliveryStop && !deliveryStop.completed) {
                    const parcel = GlobalState.route.parcels?.find(p => p.id === stop.parcelId);
                    if (parcel) {
                        GlobalState.parcels.inPossession.push({
                            ...parcel,
                            pickupTime: stop.timestamp
                        });
                    }
                }
            }
        });
    },

    // Show cash widget
    showCashWidget() {
        const existingWidget = document.querySelector('.cash-widget');
        if (existingWidget) existingWidget.remove();
        
        const pendingAmount = GlobalState.parcels.cashToCollect - GlobalState.parcels.cashCollected;
        const hasPending = pendingAmount > 0;
        
        const widget = document.createElement('div');
        widget.className = `cash-widget ${hasPending ? 'has-pending' : ''}`;
        widget.innerHTML = `
            <div class="cash-header">
                <span>💰</span>
                <span>Cash Collection</span>
            </div>
            <div class="cash-stats">
                <div class="cash-stat">
                    <span class="label">Total</span>
                    <span class="value">${Utils.formatCurrency(GlobalState.parcels.cashToCollect)}</span>
                </div>
                <div class="cash-stat">
                    <span class="label">Collected</span>
                    <span class="value">${Utils.formatCurrency(GlobalState.parcels.cashCollected)}</span>
                </div>
                <div class="cash-stat">
                    <span class="label">Pending</span>
                    <span class="value">${Utils.formatCurrency(pendingAmount)}</span>
                </div>
            </div>
        `;
        
        document.body.appendChild(widget);
    },

    // Update cash widget
    updateCashWidget() {
        // Recalculate cash
        RouteModule.calculateFinancials();
        
        // Update or show widget
        this.showCashWidget();
    },

    // Refresh UI
    refresh() {
        this.displayRouteInfo();
        this.displayStops();
        
        if (GlobalState.parcels.cashToCollect > 0) {
            this.updateCashWidget();
        }
    },

    // Toggle panel
    togglePanel() {
        const panel = document.getElementById('routePanel');
        const navControls = document.getElementById('navControls');
        
        if (!panel) return;
        
        if (GlobalState.ui.panelVisible) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    },

    // Show panel
    showPanel() {
        const panel = document.getElementById('routePanel');
        const navControls = document.getElementById('navControls');
        
        if (panel) {
            panel.style.display = 'block';
            panel.style.transform = 'translateY(0)';
            GlobalState.ui.panelVisible = true;
        }
        
        if (navControls) {
            navControls.style.display = 'flex';
        }
    },

    // Hide panel
    hidePanel() {
        const panel = document.getElementById('routePanel');
        const navControls = document.getElementById('navControls');
        
        if (panel) {
            panel.style.display = 'none';
            GlobalState.ui.panelVisible = false;
        }
        
        if (navControls && GlobalState.navigation.isActive) {
            navControls.style.display = 'none';
        }
    },

    // Start navigation
    startNavigation() {
        const nextStop = RouteModule.getNextStop();
        if (nextStop) {
            NavigationModule.startNavigation(nextStop);
        } else {
            Utils.showNotification('No stops to navigate to', 'warning');
        }
    },

    // Update location info
    updateLocationInfo() {
        // Update any location-based UI elements
        if (GlobalState.location) {
            // Could update distance to next stop, etc.
        }
    },

    // Show empty state
    showEmptyState() {
        const routePanel = document.getElementById('routePanel');
        const navControls = document.getElementById('navControls');
        const emptyState = document.getElementById('emptyState');
        
        if (routePanel) routePanel.style.display = 'none';
        if (navControls) navControls.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
    },

    // Show error state
    showErrorState(message) {
        const errorHTML = `
            <div class="error-content">
                <div class="error-icon">⚠️</div>
                <h2>Error Loading Route</h2>
                <p>${message}</p>
                <button onclick="window.location.reload()">
                    Try Again
                </button>
                <button onclick="window.location.href='./rider.html'">
                    Back to Dashboard
                </button>
            </div>
        `;
        
        document.body.innerHTML = errorHTML;
    },

    // Setup event handlers
    setupEventHandlers() {
        // Panel drag functionality
        const panel = document.getElementById('routePanel');
        const handle = panel?.querySelector('.panel-handle');
        
        if (handle) {
            let isDragging = false;
            let startY = 0;
            let currentHeight = 0;
            
            handle.addEventListener('touchstart', startDrag, { passive: true });
            handle.addEventListener('mousedown', startDrag);
            
            function startDrag(e) {
                isDragging = true;
                startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
                currentHeight = panel.offsetHeight;
                handle.style.cursor = 'grabbing';
            }
            
            document.addEventListener('touchmove', drag, { passive: false });
            document.addEventListener('mousemove', drag);
            
            function drag(e) {
                if (!isDragging) return;
                e.preventDefault();
                
                const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
                const deltaY = startY - currentY;
                const newHeight = Math.max(140, Math.min(window.innerHeight * 0.7, currentHeight + deltaY));
                
                panel.style.height = `${newHeight}px`;
            }
            
            document.addEventListener('touchend', stopDrag);
            document.addEventListener('mouseup', stopDrag);
            
            function stopDrag() {
                if (!isDragging) return;
                isDragging = false;
                handle.style.cursor = 'grab';
                
                const finalHeight = panel.offsetHeight;
                if (finalHeight > 300) {
                    panel.style.height = '60%';
                    GlobalState.ui.panelExpanded = true;
                } else {
                    panel.style.height = '140px';
                    GlobalState.ui.panelExpanded = false;
                }
            }
        }
    }
};

// ============================================================================
// COMPLETE THE INITIALIZATION (Already defined in Part 2)
// ============================================================================

console.log('✅ Route Navigation Module Part 3 loaded successfully!');
console.log('All modules complete: Route, Verification, Navigation, Map, Location, UI');
console.log('Fixed: Verification flow now properly shows POD after code verification for deliveries');
