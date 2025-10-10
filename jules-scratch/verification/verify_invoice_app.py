from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # 1. Navegar a la aplicación
    page.goto("http://localhost:8000")

    # 2. Esperar a que el mensaje de error de Firebase sea visible
    # Esto confirma que el JS se ejecutó y manejó la ausencia de configuración
    loading_message = page.locator("#loading-message")
    expect(loading_message).to_have_text("ERROR CRÍTICO: Configuración de Firebase no encontrada.", timeout=10000)

    # 3. Verificar que el título es correcto
    expect(page).to_have_title("Gestión de Facturas y Reportes")

    # 4. Tomar la captura de pantalla
    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)