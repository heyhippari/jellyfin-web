import jQuery from 'jquery';
import { describe, expect, it } from 'vitest';

import './jqueryGlobals';

describe('legacy jQuery globals', () => {
    it('publishes the imported jQuery instance under both compatibility names', () => {
        expect(window.$).toBe(jQuery);
        expect(window.jQuery).toBe(jQuery);
    });
});
