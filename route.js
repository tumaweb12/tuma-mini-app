<!-- Add this style block to your route.html file after the existing styles -->
<style>
/* Enhanced Map Legend */
.map-legend {
    background: var(--surface-elevated);
    border-radius: 12px;
    padding: 12px;
    margin: 10px;
    border: 1px solid var(--border);
    backdrop-filter: blur(10px);
}

.legend-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
}

.legend-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
}

.legend-icon.pickup {
    background: rgba(255, 159, 10, 0.2);
}

.legend-icon.delivery {
    background: rgba(52, 199, 89, 0.2);
}

.legend-icon.completed {
    background: rgba(102, 102, 102, 0.2);
}

/* Enhanced Stop Markers */
.stop-marker-wrapper {
    position: relative;
    text-align: center;
}

.stop-marker {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 3px 10px rgba(0,0,0,0.3);
    border: 3px solid white;
    position: relative;
    transition: all 0.3s ease;
}

.stop-marker.pickup {
    background: #FF9F0A;
}

.stop-marker.delivery {
    background: #34C759;
}

.stop-marker-wrapper.completed .stop-marker {
    background: #666;
    opacity: 0.8;
}

.stop-marker-wrapper.active .stop-marker {
    animation: bounce 1s ease-in-out infinite;
    box-shadow: 0 5px 20px rgba(0,0,0,0.5);
}

.marker-number {
    color: white;
    font-weight: bold;
    font-size: 18px;
}

.marker-label {
    position: absolute;
    top: 45px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--surface-elevated);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid var(--border);
}

.marker-pulse {
    position: absolute;
    top: -10px;
    left: -10px;
    right: -10px;
    bottom: -10px;
    border: 2px solid var(--primary);
    border-radius: 50%;
    animation: pulse 2s ease-out infinite;
}

@keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
}

@keyframes pulse {
    0% {
        transform: scale(1);
        opacity: 1;
    }
    100% {
        transform: scale(1.5);
        opacity: 0;
    }
}

/* Enhanced Popup Styles */
.enhanced-popup .leaflet-popup-content-wrapper {
    background: var(--surface-elevated);
    border-radius: 16px;
    padding: 0;
    overflow: hidden;
}

.enhanced-popup .leaflet-popup-tip {
    background: var(--surface-elevated);
}

.stop-popup {
    min-width: 280px;
}

.popup-header {
    padding: 12px 16px;
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
}

.popup-header.pickup {
    background: #FF9F0A;
}

.popup-header.delivery {
    background: #34C759;
}

.popup-phase {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.popup-code {
    font-size: 14px;
    font-family: monospace;
}

.popup-body {
    padding: 16px;
}

.popup-body h3 {
    margin: 0 0 12px 0;
    font-size: 16px;
    line-height: 1.3;
}

.popup-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
}

.info-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 14px;
}

.info-icon {
    font-size: 16px;
    flex-shrink: 0;
}

.phone-link {
    color: var(--primary);
    text-decoration: none;
}

.info-row.instructions {
    background: rgba(255, 159, 10, 0.1);
    padding: 8px;
    border-radius: 8px;
    font-size: 13px;
}

.popup-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.popup-action-btn {
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 10px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.2s;
}

.popup-action-btn.primary {
    background: var(--primary);
    color: white;
}

.popup-action-btn.secondary {
    background: var(--surface-high);
    color: var(--text-primary);
}

.popup-action-btn:active {
    transform: scale(0.98);
}

.btn-icon {
    font-size: 16px;
}

/* Enhanced Route Panel */
.route-phases {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 20px;
    background: var(--surface-high);
    border-radius: 14px;
    margin: 20px 0;
}

.phase {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    background: var(--surface-elevated);
    border-radius: 12px;
    border: 2px solid var(--border);
    transition: all 0.3s;
}

.phase.active {
    border-color: var(--primary);
    background: var(--surface);
    transform: scale(1.05);
}

.phase.completed {
    border-color: var(--success);
    opacity: 0.8;
}

.phase-icon {
    font-size: 32px;
}

.phase-info {
    text-align: left;
}

.phase-title {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 4px;
}

.phase-progress {
    font-size: 20px;
    font-weight: 700;
    color: var(--primary);
}

.phase.completed .phase-progress {
    color: var(--success);
}

/* Enhanced Stop Cards */
.phase-section {
    margin-bottom: 24px;
}

.phase-section.locked {
    opacity: 0.6;
    pointer-events: none;
}

.phase-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
    padding: 0 4px;
}

.phase-count {
    margin-left: auto;
    font-size: 14px;
    color: var(--text-secondary);
}

.phase-stops {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.stop-card {
    background: var(--surface-high);
    border-radius: 14px;
    padding: 16px;
    display: flex;
    align-items: stretch;
    gap: 16px;
    cursor: pointer;
    transition: all 0.3s;
    border: 2px solid transparent;
}

.stop-card:hover:not(.completed):not(.blocked) {
    background: var(--surface-elevated);
    border-color: var(--primary);
    transform: translateX(4px);
}

.stop-card.active {
    background: var(--surface);
    border-color: var(--primary);
    box-shadow: 0 4px 20px rgba(0, 102, 255, 0.2);
}

.stop-card.completed {
    opacity: 0.6;
    cursor: default;
}

.stop-card.blocked {
    opacity: 0.5;
    cursor: not-allowed;
}

.stop-number-badge {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 20px;
    color: white;
    flex-shrink: 0;
}

.stop-number-badge.pickup {
    background: #FF9F0A;
}

.stop-number-badge.delivery {
    background: #34C759;
}

.stop-card.completed .stop-number-badge {
    background: #666;
}

.stop-content {
    flex: 1;
}

.stop-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
}

.stop-address {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    line-height: 1.3;
}

.stop-distance {
    font-size: 13px;
    color: var(--text-secondary);
    flex-shrink: 0;
}

.stop-details {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.detail-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 14px;
    color: var(--text-secondary);
}

.detail-icon {
    font-size: 16px;
    flex-shrink: 0;
}

.detail-row.instructions {
    background: rgba(255, 159, 10, 0.1);
    padding: 6px 8px;
    border-radius: 6px;
    margin-top: 4px;
}

.stop-status {
    margin-top: 8px;
    font-size: 13px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 6px;
    display: inline-block;
}

.stop-status.active {
    background: rgba(0, 102, 255, 0.1);
    color: var(--primary);
}

.stop-status.completed {
    background: rgba(52, 199, 89, 0.1);
    color: var(--success);
}

.stop-status.blocked {
    background: rgba(255, 159, 10, 0.1);
    color: var(--warning);
}

.stop-actions {
    display: flex;
    gap: 8px;
    align-items: center;
}

.action-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    font-size: 18px;
}

.action-btn.navigate {
    background: var(--primary);
    color: white;
}

.action-btn.call {
    background: var(--success);
    color: white;
}

.action-btn:active {
    transform: scale(0.9);
}

/* Enhanced Verification Modal */
.verification-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}

.modal-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(10px);
}

.modal-content {
    position: relative;
    background: var(--surface-elevated);
    border-radius: 20px;
    max-width: 400px;
    width: 100%;
    overflow: hidden;
    animation: modalSlideIn 0.3s ease-out;
}

.verification-modal.closing .modal-content {
    animation: modalSlideOut 0.3s ease-out;
}

@keyframes modalSlideIn {
    from {
        transform: translateY(100px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

@keyframes modalSlideOut {
    from {
        transform: translateY(0);
        opacity: 1;
    }
    to {
        transform: translateY(100px);
        opacity: 0;
    }
}

.modal-header {
    padding: 20px;
    text-align: center;
    color: white;
}

.modal-header.pickup {
    background: linear-gradient(135deg, #FF9F0A 0%, #FF7F00 100%);
}

.modal-header.delivery {
    background: linear-gradient(135deg, #34C759 0%, #28A745 100%);
}

.modal-icon {
    font-size: 48px;
    display: block;
    margin-bottom: 8px;
}

.modal-header h2 {
    margin: 0;
    font-size: 24px;
}

.modal-body {
    padding: 24px;
}

.stop-summary {
    background: var(--surface-high);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 24px;
}

.stop-summary h3 {
    margin: 0 0 12px 0;
    font-size: 18px;
}

.summary-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.summary-row {
    display: flex;
    gap: 8px;
    font-size: 14px;
}

.summary-label {
    color: var(--text-secondary);
    min-width: 80px;
}

.summary-value {
    color: var(--text-primary);
    font-weight: 500;
}

.summary-row.instructions {
    background: rgba(255, 159, 10, 0.1);
    padding: 8px;
    border-radius: 8px;
    margin-top: 4px;
}

.verification-section label {
    display: block;
    font-weight: 600;
    margin-bottom: 8px;
}

.verification-input {
    width: 100%;
    padding: 16px;
    border: 2px solid var(--border);
    border-radius: 12px;
    background: var(--surface-high);
    color: white;
    font-size: 24px;
    text-align: center;
    letter-spacing: 3px;
    font-family: monospace;
    transition: all 0.3s;
}

.verification-input:focus {
    border-color: var(--primary);
    outline: none;
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(0, 102, 255, 0.2);
}

.verification-input.error {
    border-color: var(--danger);
    animation: shake 0.5s ease-in-out;
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-10px); }
    75% { transform: translateX(10px); }
}

.code-hint {
    font-size: 13px;
    color: var(--text-secondary);
    text-align: center;
    margin-top: 8px;
}

.modal-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 24px;
}

.modal-btn {
    width: 100%;
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

.modal-btn.secondary {
    background: var(--surface-high);
    color: var(--text-primary);
}

.modal-btn:active {
    transform: scale(0.98);
}

/* Success Animations */
.success-animation {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: var(--success);
    color: white;
    padding: 40px;
    border-radius: 20px;
    text-align: center;
    z-index: 10000;
    animation: successPop 0.5s ease-out;
}

@keyframes successPop {
    0% {
        transform: translate(-50%, -50%) scale(0);
        opacity: 0;
    }
    50% {
        transform: translate(-50%, -50%) scale(1.1);
    }
    100% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
    }
}

.success-icon {
    font-size: 64px;
    margin-bottom: 16px;
}

.success-text {
    font-size: 24px;
    font-weight: 700;
}

/* Phase Complete Animation */
.phase-complete-animation {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.9);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.phase-complete-content {
    background: var(--surface-elevated);
    border-radius: 24px;
    padding: 48px;
    text-align: center;
    max-width: 400px;
    animation: slideUp 0.5s ease-out;
}

@keyframes slideUp {
    from {
        transform: translateY(50px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.phase-complete-content .phase-icon {
    font-size: 80px;
    margin-bottom: 24px;
    animation: bounce 1s ease-in-out;
}

.phase-complete-content h2 {
    font-size: 32px;
    margin-bottom: 16px;
}

.phase-complete-content p {
    font-size: 18px;
    color: var(--text-secondary);
}

/* Route Complete Animation */
.route-complete-animation {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.95);
    backdrop-filter: blur(20px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
}

.route-complete-content {
    background: linear-gradient(135deg, var(--surface-elevated) 0%, var(--surface) 100%);
    border-radius: 24px;
    padding: 48px;
    text-align: center;
    max-width: 400px;
    border: 2px solid var(--success);
    animation: completePop 0.8s ease-out;
}

@keyframes completePop {
    0% {
        transform: scale(0) rotate(180deg);
        opacity: 0;
    }
    50% {
        transform: scale(1.1) rotate(-10deg);
    }
    100% {
        transform: scale(1) rotate(0);
        opacity: 1;
    }
}

.complete-icon {
    font-size: 100px;
    margin-bottom: 24px;
    animation: celebrate 2s ease-in-out infinite;
}

@keyframes celebrate {
    0%, 100% { transform: scale(1) rotate(0); }
    25% { transform: scale(1.1) rotate(-5deg); }
    75% { transform: scale(1.1) rotate(5deg); }
}

.route-complete-content h1 {
    font-size: 36px;
    margin-bottom: 16px;
    background: linear-gradient(135deg, var(--primary) 0%, var(--success) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.route-complete-content p {
    font-size: 18px;
    color: var(--text-secondary);
    margin-bottom: 32px;
}

.route-stats {
    display: flex;
    justify-content: center;
    gap: 40px;
    margin-bottom: 32px;
}

.route-stats .stat {
    text-align: center;
}

.route-stats .stat-value {
    font-size: 32px;
    font-weight: 700;
    color: var(--primary);
    display: block;
    margin-bottom: 4px;
}

.route-stats .stat-label {
    font-size: 14px;
    color: var(--text-secondary);
}

.complete-btn {
    width: 100%;
    padding: 18px;
    background: var(--success);
    color: white;
    border: none;
    border-radius: 14px;
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
}

.complete-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(52, 199, 89, 0.4);
}

/* Enhanced Notifications */
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 20px;
    border-radius: 12px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: notificationSlide 0.3s ease-out;
    z-index: 10000;
    max-width: 350px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}

@keyframes notificationSlide {
    from {
        transform: translateX(400px);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.notification.hiding {
    animation: notificationHide 0.3s ease-out;
}

@keyframes notificationHide {
    from {
        transform: translateX(0);
        opacity: 1;
    }
    to {
        transform: translateX(400px);
        opacity: 0;
    }
}

.notification-icon {
    font-size: 20px;
}

.notification.success {
    background: var(--success);
    color: white;
}

.notification.error {
    background: var(--danger);
    color: white;
}

.notification.warning {
    background: var(--warning);
    color: black;
}

.notification.info {
    background: var(--surface-elevated);
    color: white;
    border: 1px solid var(--border);
}

/* Animated Routes */
.pickup-route {
    stroke-dasharray: 10, 10;
    animation: routeFlow 3s linear infinite;
}

.delivery-route {
    stroke-dasharray: 10, 10;
    animation: routeFlow 3s linear infinite reverse;
}

@keyframes routeFlow {
    0% { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: -20; }
}

/* Location Button Enhancement */
.location-button {
    transition: all 0.3s;
}

.location-button:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}

.location-button.active {
    background: var(--primary);
    color: white;
    animation: locationPulse 1s ease-out;
}

@keyframes locationPulse {
    0% {
        box-shadow: 0 0 0 0 rgba(0, 102, 255, 0.7);
    }
    100% {
        box-shadow: 0 0 0 20px rgba(0, 102, 255, 0);
    }
}

/* Progress Bars */
.phase-progress-bar {
    height: 4px;
    background: var(--surface-high);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 8px;
}

.phase-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--primary) 0%, var(--success) 100%);
    transition: width 0.5s ease-out;
}

/* Carrying Banner Enhancement */
.carrying-banner {
    background: linear-gradient(135deg, rgba(255, 159, 10, 0.2) 0%, rgba(255, 159, 10, 0.1) 100%);
    animation: subtle-pulse 2s ease-in-out infinite;
}

@keyframes subtle-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
}

/* Parcels Widget */
.parcels-possession-widget {
    background: linear-gradient(135deg, var(--surface-elevated) 0%, var(--surface-high) 100%);
    border: 1px solid var(--warning);
}

.parcel-card {
    transition: all 0.3s;
}

.parcel-card:hover {
    transform: translateX(4px);
    border-left-color: var(--primary);
}

/* Quick Verify Button */
.route-badge.verify-btn {
    cursor: pointer;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    transition: all 0.3s;
    border: 2px solid transparent;
}

.route-badge.verify-btn:hover {
    transform: scale(1.05);
    border-color: rgba(255, 255, 255, 0.3);
}

.route-badge.verify-btn:active {
    transform: scale(0.95);
}

.route-badge.verify-btn.pickup {
    background: var(--warning);
    color: black;
}

.route-badge.verify-btn.delivery {
    background: var(--success);
    color: white;
}

.route-badge.verify-btn.completed {
    background: var(--surface-high);
    color: var(--text-secondary);
    cursor: not-allowed;
    opacity: 0.6;
}

.route-badge.verify-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}

/* Quick Verification Modal */
.verification-modal.quick-verify .modal-content {
    max-width: 320px;
}

.verification-modal.quick-verify .modal-content.compact {
    animation: quickModalSlide 0.2s ease-out;
}

@keyframes quickModalSlide {
    from {
        transform: translateY(50px) scale(0.9);
        opacity: 0;
    }
    to {
        transform: translateY(0) scale(1);
        opacity: 1;
    }
}

.quick-stop-info {
    background: var(--surface-high);
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 16px;
}

.quick-stop-info h3 {
    font-size: 16px;
    margin: 0 0 4px 0;
}

.stop-meta {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
}

.quick-actions {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 8px;
    margin-top: 16px;
}

.modal-btn.compact {
    padding: 14px;
}

/* Mobile Quick Verify */
@media (max-width: 428px) {
    .verification-modal.quick-verify .modal-content {
        margin: 10px;
        max-width: calc(100vw - 20px);
    }
    
    .quick-actions {
        grid-template-columns: 1fr;
    }
}
    
    .phase {
        width: 100%;
    }
    
    .phase-arrow {
        transform: rotate(90deg);
        margin: 8px 0;
    }
    
    .stop-card {
        flex-direction: column;
        text-align: center;
    }
    
    .stop-number-badge {
        margin: 0 auto;
    }
    
    .stop-actions {
        justify-content: center;
        margin-top: 12px;
    }
    
    .modal-content {
        margin: 20px;
        max-width: calc(100vw - 40px);
    }
}

/* Dark Mode Enhancements */
@media (prefers-color-scheme: dark) {
    .stop-marker {
        box-shadow: 0 3px 15px rgba(0,0,0,0.5);
    }
    
    .enhanced-popup .leaflet-popup-content-wrapper {
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
}

/* Accessibility Enhancements */
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
    
    .animated-route {
        animation: none !important;
    }
}

/* Focus States */
.action-btn:focus,
.modal-btn:focus,
.popup-action-btn:focus {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
}

.verification-input:focus {
    outline: none;
    border-color: var(--primary);
}

/* Loading States */
.stop-card.loading {
    pointer-events: none;
    opacity: 0.6;
}

.stop-card.loading::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border: 2px solid var(--primary);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
</style>
