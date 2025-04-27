export const INTERACTIVE_ID_KEY = 'data-interactive-id'; // Unique key for interactive elements
export const DEFAULT_MODEL = "gpt-4o"; // Default OpenAI model
export const DEFAULT_SCREENSHOT_PATH = 'screenshot.png';
export const DEFAULT_WAIT_TIME_MS = 500; // Wait time between agent loops
export const DEFAULT_ACTION_TIMEOUT_MS = 5000; // Max time for a single Playwright action
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 30000; // Max time for page navigation
export const MAX_AGENT_LOOPS = 30; // Prevent infinite loops
export const LOG_PREFIX = '[BugReproAgent]'; // Consistent logging prefix