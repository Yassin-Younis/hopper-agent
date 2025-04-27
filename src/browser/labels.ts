// src/browser/labels.ts
import { Page, Locator } from 'playwright';
import { INTERACTIVE_ID_KEY, LOG_PREFIX } from '../common/constants'; // Use constant

// --- injectLabelsScript (Code to be evaluated in the browser) ---
// This is a template literal containing the IIFE that will run in the browser context.
export const injectLabelsScript = `
(function() {
    // --- Constants and State ---
    const ID_KEY = '${INTERACTIVE_ID_KEY}'; // Injected constant
    const LABEL_CONTAINER_ID = '__bugReproAgentLabelsContainer__';
    // More comprehensive lists based on common interactive patterns and roles
    const interactiveRoles = new Set(['button', 'link', 'menuitem', 'option', 'checkbox', 'radio', 'slider', 'switch', 'textbox', 'searchbox', 'combobox', 'listbox', 'tab', 'treeitem', 'gridcell', 'spinbutton', 'slider']);
    const interactiveTags = new Set(['button', 'a', 'input', 'select', 'textarea', 'details', 'summary']);
    // Map<Element, { label: HTMLElement, id: string }>
    const elementLabels = new Map();
    let uniqueIdCounter = 0;
    let labelContainer = document.getElementById(LABEL_CONTAINER_ID);
    let updateQueued = false;

    // --- Initialization ---
    function initializeLabelContainer() {
        if (!labelContainer) {
            console.log('${LOG_PREFIX} Initializing label container.');
            labelContainer = document.createElement('div');
            labelContainer.id = LABEL_CONTAINER_ID;
            labelContainer.style.position = 'absolute';
            labelContainer.style.top = '0';
            labelContainer.style.left = '0';
            labelContainer.style.width = '0';
            labelContainer.style.height = '0';
            labelContainer.style.zIndex = '2147483647'; // Max z-index
            labelContainer.style.pointerEvents = 'none';
            if (document.body) {
                document.body.appendChild(labelContainer);
            } else {
                // Handle cases where body isn't ready immediately
                document.addEventListener('DOMContentLoaded', () => {
                    if (!labelContainer.parentNode && document.body) {
                         document.body.appendChild(labelContainer);
                    }
                });
            }
        }
    }

    // --- Helper Functions ---

    // Efficiently get all elements including those in shadow DOMs
    function getAllElements() {
        const elements = [];
        const collectElements = (root) => {
            root.querySelectorAll('*').forEach(el => {
                elements.push(el);
                if (el.shadowRoot) {
                    collectElements(el.shadowRoot);
                }
            });
        };
        collectElements(document);
        return elements;
    }

    function createOrUpdateLabel(element, id) {
        let entry = elementLabels.get(element);
        let labelElement = entry ? entry.label : null;
        const rect = element.getBoundingClientRect();

        if (!labelElement) {
             // Create new label
            labelElement = document.createElement('div');
            labelElement.textContent = id;
            labelElement.style.position = 'absolute';
            labelElement.style.backgroundColor = 'rgba(255, 0, 0, 0.85)'; // Brighter red
            labelElement.style.color = 'white';
            labelElement.style.fontSize = '10px';
            labelElement.style.padding = '1px 3px';
            labelElement.style.borderRadius = '3px';
            labelElement.style.fontFamily = 'monospace';
            labelElement.style.whiteSpace = 'nowrap';
            labelElement.style.pointerEvents = 'none'; // Ensure it doesn't block interactions
            labelElement.style.display = 'none'; // Initially hidden
            labelContainer.appendChild(labelElement);
             entry = { label: labelElement, id: id };
             elementLabels.set(element, entry);
        } else if (entry.id !== id) {
            // Update ID if somehow reassigned (should be rare)
            entry.id = id;
            labelElement.textContent = id;
        }

        // Update position, clamp to viewport edges
        const labelHeight = labelElement.offsetHeight || 14; // Estimate height if not rendered
        const labelWidth = labelElement.offsetWidth || 10 + (id.length * 6); // Estimate width

        let top = rect.top + window.scrollY - (labelHeight / 2); // Try to center vertically
        let left = rect.right + window.scrollX + 2;

        // Prevent going off-screen
        top = Math.max(window.scrollY + 2, Math.min(top, window.scrollY + window.innerHeight - labelHeight - 2));
        left = Math.max(window.scrollX + 2, Math.min(left, window.scrollX + window.innerWidth - labelWidth - 2));

        labelElement.style.top = \`\${top}px\`;
        labelElement.style.left = \`\${left}px\`;
        labelElement.style.display = 'block'; // Make visible
    }

    function isElementInViewport(el) {
        const rect = el.getBoundingClientRect();
        return (
            rect.top < window.innerHeight &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.right > 0 &&
            rect.width > 0 && // Must have dimensions
            rect.height > 0
        );
    }

    function isVisible(el) {
        if (!el || !el.isConnected) return false; // Element not in DOM

        // Check if within viewport first (cheap check)
        if (!isElementInViewport(el)) {
             return false;
        }

        // Check computed styles
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }
        // Check bounding box dimensions again (styles might override geometry)
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) {
            return false;
        }

        // Check for occlusion using center point (faster than multiple points)
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        try {
            // Need to temporarily hide our labels container to perform accurate check
             if (labelContainer) labelContainer.style.visibility = 'hidden';
            const elementAtCenter = document.elementFromPoint(centerX, centerY);
             if (labelContainer) labelContainer.style.visibility = 'visible'; // Restore visibility

            if (!elementAtCenter) return false; // Point outside document bounds?

            // Check if the element at center is the element itself or a descendant
            if (elementAtCenter !== el && !el.contains(elementAtCenter)) {
                // It might be obscured by something else
                return false;
            }
        } catch (e) {
             if (labelContainer) labelContainer.style.visibility = 'visible'; // Ensure restoration
            console.warn('${LOG_PREFIX} elementFromPoint check failed for element:', el, e);
            // If check fails, err on the side of caution (assume visible if other checks pass)
        }

        // Check parents for visibility (costly, do last)
        let parent = el.parentElement;
        while (parent && parent !== document.body) {
            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || parentStyle.opacity === '0') {
                return false;
            }
            parent = parent.parentElement;
        }

        return true; // All checks passed
    }

    function isInteractive(el) {
        if (!el || typeof el.getAttribute !== 'function') return false;

        // Check if disabled (common attribute)
        if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
             return false;
        }

        const tagName = el.tagName.toLowerCase();
        const role = el.getAttribute('role');

        // Check common interactive tags
        if (interactiveTags.has(tagName)) {
             // Special case for input: check type if available
             if (tagName === 'input') {
                const inputType = el.getAttribute('type');
                if (inputType === 'hidden') return false;
             }
            return true;
        }
        // Check common interactive roles
        if (role && interactiveRoles.has(role)) return true;
        // Check contentEditable attribute
        if (el.isContentEditable) return true;
        // Check for specific attributes like href on <a> but not <link>
        if (tagName === 'a' && el.hasAttribute('href')) return true;
        // Check tabIndex makes it focusable (tabIndex >= 0)
        if (el.hasAttribute('tabindex') && parseInt(el.getAttribute('tabindex'), 10) >= 0) return true;

        // Heuristic: Check if it has common event listener names attached directly
        // NOTE: This misses listeners attached via addEventListener! It's a limited check.
         const eventHandlers = ['onclick', 'onmousedown', 'onmouseup', 'ondblclick', 'onkeydown', 'onkeyup', 'onkeypress'];
         if (eventHandlers.some(handler => el[handler] != null)) {
             return true;
         }

        return false;
    }

     // Check if an element is redundant (e.g., a span inside an already interactive button)
     function isRedundant(el) {
        let parent = el.parentElement;
        let depth = 0;
        while (parent && parent !== document.body && depth < 3) { // Limit search depth
            if (elementLabels.has(parent) && isInteractive(parent)) {
                // If parent is already labeled and interactive, this one is likely redundant
                return true;
            }
            parent = parent.parentElement;
            depth++;
        }
        return false;
    }


    // --- Core Update Logic ---
    function updateLabels() {
        if (!document.body || !labelContainer) {
            console.warn('${LOG_PREFIX} Document body or label container not ready for update.');
            initializeLabelContainer(); // Try re-initializing
            return;
        }
        // console.time('updateLabels'); // For performance measurement

        const elements = getAllElements();
        const visibleInteractiveElements = new Set(); // Set of elements that should be labeled

        // 1. Identify all potentially visible and interactive elements
        elements.forEach(el => {
            if (isVisible(el) && isInteractive(el)) {
                visibleInteractiveElements.add(el);
            }
        });

        const finalElementsToLabel = new Set();
        // 2. Filter out redundant elements (e.g., elements inside already interactive ones)
        visibleInteractiveElements.forEach(el => {
             if (!isRedundant(el)) {
                 finalElementsToLabel.add(el);
             }
        });


        // 3. Manage labels: remove old/hidden, add/update current
        const currentElements = new Set(finalElementsToLabel);
        const elementsToRemove = [];

        // Find labels for elements that are no longer visible/interactive/valid
        elementLabels.forEach((entry, element) => {
            if (!currentElements.has(element)) {
                elementsToRemove.push(element);
                if (entry.label && entry.label.parentNode) {
                    entry.label.parentNode.removeChild(entry.label);
                }
                if (element.hasAttribute(ID_KEY)) {
                    element.removeAttribute(ID_KEY);
                }
            }
        });

        // Remove stale entries from the map
        elementsToRemove.forEach(element => elementLabels.delete(element));

        // Add/update labels for currently visible/interactive elements
        finalElementsToLabel.forEach(element => {
            let id;
            const existingEntry = elementLabels.get(element);
            if (existingEntry) {
                id = existingEntry.id; // Reuse existing ID
            } else {
                id = \`\${uniqueIdCounter++}\`; // Generate new ID
            }
            element.setAttribute(ID_KEY, id); // Ensure attribute is set/updated
            createOrUpdateLabel(element, id); // Create or update the visual label
        });

        // console.log('${LOG_PREFIX} Labels updated. Count:', elementLabels.size);
        // console.timeEnd('updateLabels');
        updateQueued = false; // Allow next update
    }

    // --- Debounced Update Trigger ---
    function queueUpdate() {
        if (!updateQueued) {
            updateQueued = true;
            requestAnimationFrame(updateLabels);
        }
    }

    // --- Observers and Event Listeners ---
    function startObserving() {
        initializeLabelContainer();

        if (!document.body) {
             console.error('${LOG_PREFIX} document.body is null, cannot observe mutations.');
             // Retry after DOMContentLoaded
             document.addEventListener('DOMContentLoaded', () => {
                 if (document.body) {
                    startObserving(); // Retry initialization
                 } else {
                     console.error('${LOG_PREFIX} document.body still null after DOMContentLoaded.');
                 }
             });
            return;
        }

        // Initial run
        queueUpdate();

        // Observe DOM changes
        const observer = new MutationObserver((mutations) => {
            // Check if relevant attributes changed or structure changed
             const relevantMutation = mutations.some(m =>
                 m.type === 'childList' ||
                 (m.type === 'attributes' && ['style', 'class', 'hidden', 'disabled', 'role', 'tabindex', 'href', 'contenteditable'].includes(m.attributeName))
             );
             if (relevantMutation) {
                queueUpdate();
             }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden', 'disabled', 'role', 'tabindex', 'href', 'contenteditable'] // Observe relevant attributes
        });

        // Update on scroll and resize
        window.addEventListener('scroll', queueUpdate, { capture: true, passive: true });
        window.addEventListener('resize', queueUpdate, { passive: true });

        console.log('${LOG_PREFIX} Labeling Agent Initialized and Observing.');
    }

    // --- Start ---
    if (document.readyState === 'loading') {
         document.addEventListener('DOMContentLoaded', startObserving);
    } else {
         startObserving(); // Already loaded or interactive
    }

})(); // End of IIFE
`;


// --- extractElementsInfo function (Playwright context) ---
/**
 * Extracts information about currently labeled interactive elements on the page.
 * @param page The Playwright Page object.
 * @returns A Promise resolving to an array of strings describing the elements.
 */
export async function extractElementsInfo(page: Page): Promise<string[]> {
    const selector = `[${INTERACTIVE_ID_KEY}]`;
    const results: string[] = [];

    try {
        const elements = await page.locator(selector).all();

        for (const element of elements) {
            try {
                // Playwright-side visibility check is crucial
                if (!(await element.isVisible())) {
                    continue;
                }

                const id = await element.getAttribute(INTERACTIVE_ID_KEY);
                if (!id) continue; // Should not happen if selector is correct

                // Use evaluate to get multiple properties efficiently in one browser context call
                const data = await element.evaluate(el => {
                    // Helper to get aria name
                    const getAriaName = (target: Element): string | null => {
                        let name = target.getAttribute('aria-label');
                        if (name) return name.trim();

                        const labelledbyId = target.getAttribute('aria-labelledby');
                        if (labelledbyId) {
                            const labelElement = document.getElementById(labelledbyId);
                            name = labelElement ? (labelElement.textContent || '').trim() : null;
                            if (name) return name;
                        }
                        // Fallback using built-in accessibility computation (might be heavier)
                        try {
                            const axNode = new (window as any).AccessibilityNode(el);
                            name = axNode.name();
                            if (name) return name.trim();
                        } catch(e) { /* ignore if AccessibilityNode not available */ }

                        return null;
                    };

                    const tagName = el.tagName.toLowerCase();
                    const role = el.getAttribute('role');
                    const ariaName = getAriaName(el);
                    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
                    const value = (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
                    const placeholder = el.getAttribute('placeholder');
                    const href = tagName === 'a' ? el.getAttribute('href') : null;
                    const type = tagName === 'input' ? el.getAttribute('type') : null;

                    return { tagName, role, ariaName, text, value, placeholder, href, type };
                });

                // Construct the description string
                let description = `${data.tagName}`;
                if (data.type) description += `[type="${data.type}"]`;
                if (data.role) description += `[role="${data.role}"]`;

                // Prioritize ARIA name, then text content
                const nameOrText = data.ariaName || (data.text.length > 0 && data.text.length < 100 ? data.text : null);
                if (nameOrText) {
                    description += ` "${nameOrText}"`;
                } else if (data.placeholder) {
                    description += ` (placeholder: "${data.placeholder}")`;
                }

                if (data.value && typeof data.value === 'string' && data.value.length > 0 && data.value.length < 50) {
                    description += ` (value: "${data.value}")`;
                }
                if (data.href) {
                    description += ` (href: "${data.href.substring(0, 50)}${data.href.length > 50 ? '...' : ''}")`;
                }

                results.push(`[${id}] - ${description}`);

            } catch (extractError: any) {
                if (extractError.message?.includes('Target closed')) {
                    console.warn(`${LOG_PREFIX} Target closed during element extraction.`);
                    break; // Stop extraction if page context is lost
                }
                console.warn(`${LOG_PREFIX} Error extracting info for one element: ${extractError.message}`);
                // Continue with other elements
            }
        }
    } catch (locatorError: any) {
        if (locatorError.message?.includes('Target closed')) {
            console.warn(`${LOG_PREFIX} Target closed while locating elements.`);
            return ["Error: Page or context closed during element location."];
        }
        console.error(`${LOG_PREFIX} Error locating interactive elements with selector "${selector}":`, locatorError);
        return ["Error: Could not locate interactive elements."];
    }
    // Sort results numerically by ID for consistency
    results.sort((a, b) => {
        const idA = parseInt(a.match(/\[(\d+)\]/)?.[1] || '0', 10);
        const idB = parseInt(b.match(/\[(\d+)\]/)?.[1] || '0', 10);
        return idA - idB;
    });

    return results;
}