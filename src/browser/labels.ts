export async function injectLabels() {
    const ID_KEY = 'data-interactive-id';
    const interactiveRoles = ['button', 'link', 'menubar', "menuitem", "option", "checkbox", "radio", "slider", "switch"];
    const interactiveElement = ['button', 'a', 'input', 'select', 'textarea', 'details', 'summary']
    let elementLabels = [];
    let uniqueIdCounter = 0;

    function calculateAllElements() {
        let elements = Array.from(document.querySelectorAll('*'));
        let shadowElements = [];

        elements.forEach((elem) => {
            if (elem.shadowRoot) {
                shadowElements.push(...Array.from(elem.shadowRoot.querySelectorAll('*')));
            }
        });

        elements.push(...shadowElements);
        return elements
    }

    function createIdLabel(uniqueId, el) {
        const idLabel = document.createElement('div');
        idLabel.textContent = uniqueId;
        idLabel.style.position = 'absolute';
        idLabel.style.top = `${el.getBoundingClientRect().top + window.scrollY}px`;
        idLabel.style.left = `${el.getBoundingClientRect().right + window.scrollX - 12}px`;
        idLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        idLabel.style.color = 'white';
        idLabel.style.fontSize = '11px';
        idLabel.style.padding = '1px 3px';
        idLabel.style.zIndex = '9999';
        idLabel.style.pointerEvents = 'none';
        return idLabel;
    }

    function isVisible(el) {
        // Check if element itself has display, visibility, opacity, or pointer-events hidden
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || style.pointerEvents === 'none') {
            return false;
        }

        let parent = el.parentElement;
        while (parent) {
            const parentStyle = window.getComputedStyle(parent);
            if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || parentStyle.opacity === '0') {
                return false;
            }
            parent = parent.parentElement;
        }

        const rect = el.getBoundingClientRect();
        // const isInViewport = rect.top >= 0 && rect.left >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && rect.right <= (window.innerWidth || document.documentElement.clientWidth);
        // if (!isInViewport) {
        //     return false;
        // }

        // Check if the element is covered by another element (sample multiple points)
        const samplePoints = [{x: rect.left + rect.width / 2, y: rect.top + rect.height / 2},  // Center
            {x: rect.left + 5, y: rect.top + 5},  // Top-left corner
            {x: rect.left + rect.width - 5, y: rect.top + 5},  // Top-right corner
            {x: rect.left + 5, y: rect.top + rect.height - 5},  // Bottom-left corner
            {x: rect.left + rect.width - 5, y: rect.top + rect.height - 5},  // Bottom-right corner
        ];

        const isCovered = samplePoints.every(point => {
            const elementsAtPoint = document.elementsFromPoint(point.x, point.y);
            // The first element in elementsAtPoint is the topmost, so we check if our target element is deeper in the stack
            return elementsAtPoint.length > 0 && elementsAtPoint[0] !== el && !el.contains(elementsAtPoint[0]);
        });

        if (isCovered) {
            return false;
        }
        // function getFirstOverlappingElement(targetElement) {
        //     if (!targetElement) return null;
        //
        //     const targetRect = targetElement.getBoundingClientRect();
        //     const allElements = elements.reverse(); // Reverse to check top elements first
        //
        //     for (const el of allElements) {
        //         if (el === targetElement || !el.offsetParent) continue; // Skip the target and hidden elements
        //
        //         const rect = el.getBoundingClientRect();
        //
        //         // Check if it overlaps the target
        //         const isOverlapping = !(rect.right <= targetRect.left ||
        //             rect.left >= targetRect.right ||
        //             rect.bottom <= targetRect.top ||
        //             rect.top >= targetRect.bottom);
        //
        //         if (isOverlapping) {
        //             // Use elementFromPoint to confirm if it's the topmost at the center of overlap
        //             const centerX = Math.max(targetRect.left, rect.left) + Math.min(targetRect.right, rect.right) / 2;
        //             const centerY = Math.max(targetRect.top, rect.top) + Math.min(targetRect.bottom, rect.bottom) / 2;
        //             const topElement = document.elementFromPoint(centerX, centerY);
        //
        //             if (topElement && (topElement === el || el.contains(topElement))) {
        //                 return el; // Return the first overlapping element on top
        //             }
        //         }
        //     }
        //
        //     return null; // No overlapping element found
        // }

        // const overlappingElement = getFirstOverlappingElement(el);
        //
        // if (overlappingElement && isInteractive(overlappingElement)) {
        //     return false;
        // }


        return true;
    }

    function removeHiddenLabels() {
        const labelsToRemove = [];
        elementLabels.forEach(({element, label}) => {
            if (!isVisible(element)) {
                labelsToRemove.push({element, label});
            }
        });

        // Now remove the labels after the iteration is complete
        labelsToRemove.forEach(({element, label}) => {
            document.body.removeChild(label);
            element.removeAttribute(ID_KEY);
        });

        // Clean up the array by removing hidden elements
        elementLabels = elementLabels.filter(({element}) => isVisible(element));
    }

    function isInteractive(el) {
        const hasInteractiveEventListener = el.onclick || el.onkeydown || el.onmousedown || el.ontouchstart
        const hasInteractiveRole = interactiveRoles.includes(el.getAttribute('role'));
        const hasTabIndex = el.tabIndex >= 0
        const isLink = el.href && el.tagName.toLowerCase() !== 'link' // Not a link
        const isInteractiveElement = interactiveElement.includes(el.tagName.toLowerCase())
        const hasAriaLabel = !!el.ariaLabel
        const isDisabled = el.id === "__next"
        return (hasInteractiveEventListener || hasInteractiveRole || hasTabIndex || isInteractiveElement || isLink || hasAriaLabel) && isVisible(el) && !isDisabled
    }

    function isParentMarked(el) {
        let parent = el.parentElement;
        while (parent) {
            if (parent.hasAttribute(ID_KEY)) {
                return true;
            }
            parent = parent.parentElement;
        }
        return false;
    }

    function generateUniqueId() {
        return `${uniqueIdCounter++}`;
    }

    function highlightPressableElements() {
        calculateAllElements().forEach(el => {
            if (el.hasAttribute(ID_KEY) || !isInteractive(el)) return;

            const uniqueId = generateUniqueId();
            el.setAttribute(ID_KEY, uniqueId);
            const idLabel = createIdLabel(uniqueId, el);
            document.body.appendChild(idLabel);
            elementLabels.push({element: el, label: idLabel});
            // el.style.outline = '1px dashed red';
        });
    }


    const observer = new MutationObserver((mutations) => {
        setTimeout(() => {
            highlightPressableElements();
            removeHiddenLabels();
        }, 100);
    });

    const targetNode = document.body;
    if (targetNode) {
        observer.observe(targetNode, {
            childList: true, subtree: true, attributes: true,
        });
    } else {
        console.error('document.body is null, cannot observe mutations.');
    }

    highlightPressableElements();
}

export async function extractActions(page) {
    // Define the selector for interactive elements.
    const interactiveSelector = '[data-interactive-id]';
    // Get all matching element handles.
    const elements = await page.locator(interactiveSelector).all()

    const results = [];

    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];

        const id = await element.getAttribute('data-interactive-id');
        const tagName = (await element.evaluate(el => el.tagName)).toLowerCase();
        const text = await element.textContent() || (await element.allTextContents()).join(' ');
        const aria = await element.ariaSnapshot();
        const href = await element.getAttribute('href');

        const elementInfo = `[${id}]  ` +
            (aria ? `${JSON.stringify(aria)}` : `- ${tagName} "${text}"`) +
            (href ? `, Href: ${href}` : '')
        results.push(elementInfo);
    }

    return results;
}
