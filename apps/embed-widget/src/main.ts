/**
 * Embed widget entry point — registers the Angular Element as a Web Component.
 * Built with: nx build embed-widget --configuration=production
 * Output: dist/apps/embed-widget/cdp-widget.js → upload to CDN
 */
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { provideHttpClient } from '@angular/common/http';
import { API_BASE_URL } from '@cdp/api-client';
import { FilterWidgetComponent } from './app/filter-widget.component';

void (async () => {
  const app = await createApplication({
    providers: [
      provideHttpClient(),
      // baseUrl is passed as an HTML attribute by the host platform — this is just a fallback
      { provide: API_BASE_URL, useValue: '' }
    ],
  });

  const FilterElement = createCustomElement(FilterWidgetComponent, {
    injector: app.injector,
  });

  customElements.define('cdp-filter-widget', FilterElement);
})();
