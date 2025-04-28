import {ChatCompletionTool} from "openai/resources/chat/completions";

export const tools: ChatCompletionTool[] = [{
    type: "function", function: {
        name: "noop", description: "Waits for a specified duration before proceeding.", parameters: {
            type: "object", properties: {
                wait_ms: {
                    type: "number", description: "The number of milliseconds to wait (default: 1000).", default: 1000
                }
            }
        }
    }
}, {
    type: "function", function: {
        name: "send_msg_to_user", description: "Sends a message to the user.", parameters: {
            type: "object", properties: {
                text: {
                    type: "string", description: "The message text to send."
                }
            }, required: ["text"]
        }
    }
}, {
    type: "function", function: {
        name: "scroll", description: "Scrolls the page by a specified amount.", parameters: {
            type: "object", properties: {
                delta_x: {
                    type: "number", description: "The horizontal scroll distance."
                }, delta_y: {
                    type: "number", description: "The vertical scroll distance."
                }
            }, required: ["delta_x", "delta_y"]
        }
    }
}, {
    type: "function", function: {
        name: "fill", description: "Fills an input field with a given value.", parameters: {
            type: "object", properties: {
                id: {
                    type: "number", description: "The field's unique identifier."
                }, value: {
                    type: "string", description: "The value to input."
                }
            }, required: ["id", "value"]
        }
    }
}, {
    type: "function", function: {
        "name": "select_option", "description": "Selects an option from a dropdown.", "parameters": {
            "type": "object", "properties": {
                "id": {
                    "type": "string", "description": "The dropdown's unique identifier."
                }, "opts": {
                    "type": "array", "description": "The option(s) to select.", "items": {
                        "type": "string"
                    }
                }
            }, "required": ["id", "opts"]
        }
    }
}, {
    type: "function", function: {
        name: "click", description: "Simulates a mouse click on an element.", parameters: {
            type: "object", properties: {
                id: {type: "number", description: "The element's unique identifier."}, button: {
                    type: "string",
                    enum: ["left", "middle", "right"],
                    default: "left",
                    description: "The mouse button to use."
                }, modifiers: {
                    type: "array",
                    items: {type: "string", enum: ["Alt", "Control", "Meta", "Shift"]},
                    description: "Optional modifier keys."
                }
            }, required: ["id"]
        }
    }
}, {
    type: "function", function: {
        name: "dblclick", description: "Simulates a double-click on an element.", parameters: {
            type: "object", properties: {
                id: {type: "number", description: "The element's unique identifier."}, button: {
                    type: "string",
                    enum: ["left", "middle", "right"],
                    default: "left",
                    description: "The mouse button to use."
                }, modifiers: {
                    type: "array",
                    items: {type: "string", enum: ["Alt", "Control", "Meta", "Shift"]},
                    description: "Optional modifier keys."
                }
            }, required: ["id"]
        }
    }
}, {
    type: "function", function: {
        name: "hover", description: "Moves the mouse cursor over an element.", parameters: {
            type: "object", properties: {
                id: {type: "number", description: "The element's unique identifier."}
            }, required: ["id"]
        }
    }
}, {
    type: "function", function: {
        name: "press", description: "Simulates a key press event on an element.", parameters: {
            type: "object", properties: {
                id: {type: "number", description: "The element's unique identifier."},
                key_comb: {type: "string", description: "The key combination to press."}
            }, required: ["id", "key_comb"]
        }
    }
}, {
    type: "function", function: {
        name: "focus", description: "Focuses an input field or element.", parameters: {
            type: "object", properties: {
                id: {type: "number", description: "The element's unique identifier."}
            }, required: ["id"]
        }
    }
}, {
    type: "function", function: {
        name: "clear", description: "Clears the contents of an input field.", parameters: {
            type: "object", properties: {
                id: {type: "number", description: "The element's unique identifier."}
            }, required: ["id"]
        }
    }
}, {
    type: "function", function: {
        name: "drag_and_drop", description: "Drags an element and drops it onto another.", parameters: {
            type: "object", properties: {
                from_id: {type: "number", description: "The element to drag."},
                to_id: {type: "number", description: "The target drop location."}
            }, required: ["from_id", "to_id"]
        }
    }
},
    // {
    //     type: "function",
    //     function: {
    //         name: "upload_file",
    //         description: "Uploads a file to an input field.",
    //         parameters: {
    //             type: "object",
    //             properties: {
    //                 id: {type: "number", description: "The file input's unique identifier."},
    //                 file: {
    //                     type: ["string", "array"],
    //                     description: "The file(s) to upload."
    //                 }
    //             },
    //             required: ["id", "file"]
    //         }
    //     }
    // },
    {
        type: "function", function: {
            name: "go_back",
            description: "Navigates back in the browser's history.",
            parameters: {type: "object", properties: {}}
        }
    }, {
        type: "function", function: {
            name: "go_forward",
            description: "Navigates forward in the browser's history.",
            parameters: {type: "object", properties: {}}
        }
    }, {
        type: "function", function: {
            name: "goto", description: "Navigates to a specific URL.", parameters: {
                type: "object", properties: {
                    url: {type: "string", description: "The URL to visit."}
                }, required: ["url"]
            }
        },

    },
    {
        type: "function",
        function: {
            name: "check_browser_console",
            description: "Retrieves recent browser console logs. Useful for checking JavaScript errors, warnings, or specific debug messages.",
            parameters: {
                type: "object",
                properties: {
                    log_types: {
                        type: "array",
                        items: { type: "string", enum: ["error", "warning", "log", "info", "debug"] },
                        description: "Optional. Filter logs by type (e.g., ['error', 'warning']). Defaults to ['error', 'warning', 'log'].",
                        default: ["error", "warning", "log"]
                    },
                    message_contains: {
                        type: "string",
                        description: "Optional. Filter logs to include only those containing this specific text substring."
                    },
                    max_logs: {
                        type: "number",
                        description: "Optional. Maximum number of matching log entries to return.",
                        default: 20
                    }
                },
                required: [] // All parameters are optional
            }
        }
    },
    {
        type: "function",
        function: {
            name: "check_network_requests",
            description: "Retrieves information about recent network requests made by the browser page. Useful for checking API call failures (4xx, 5xx status codes), redirects, or specific resource loading.",
            parameters: {
                type: "object",
                properties: {
                    url_contains: {
                        type: "string",
                        description: "Optional. Filter requests where the URL contains this substring."
                    },
                    status_codes: {
                        type: "array",
                        items: { type: "number" },
                        description: "Optional. Filter requests by specific HTTP status codes (e.g., [404, 500, 503])."
                    },
                    methods: {
                        type: "array",
                        items: { type: "string", enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"] },
                        description: "Optional. Filter requests by HTTP method (e.g., ['POST', 'PUT'])."
                    },
                    resource_types: {
                        type: "array",
                        items: { type: "string", enum: ["document", "stylesheet", "image", "media", "font", "script", "texttrack", "xhr", "fetch", "eventsource", "websocket", "manifest", "signedexchange", "ping", "cspviolationreport", "preflight", "other"] },
                        description: "Optional. Filter requests by their resource type (e.g., ['xhr', 'fetch'] for API calls)."
                    },
                    include_failed: {
                        type: "boolean",
                        description: "Optional. If true, also includes requests that failed at the network level (e.g., DNS error, connection refused), not just HTTP errors. Defaults to true.",
                        default: true
                    },
                    max_requests: {
                        type: "number",
                        description: "Optional. Maximum number of matching request entries to return.",
                        default: 20
                    }
                },
                required: [] // All parameters are optional
            }
        }
    },
    {
        type: "function",
        function: {
            name: "inspect_dom_element",
            description: "Inspects a specific DOM element using a CSS selector to retrieve its details like attributes, text content, or inner HTML. Useful when element labels are missing or insufficient, or to check specific properties.",
            parameters: {
                type: "object",
                properties: {
                    selector: {
                        type: "string",
                        description: "Required. The CSS selector to locate the element (e.g., '#myId', '.my-class', 'div[data-testid=\"value\"]'). Use standard CSS selectors, NOT the agent's interactive IDs like '[12]'."
                    },
                    attributes: {
                        type: "array",
                        items: { type: "string" },
                        description: "Optional. An array of specific attribute names to retrieve values for (e.g., ['class', 'style', 'data-value'])."
                    },
                    get_text_content: {
                        type: "boolean",
                        description: "Optional. Set to true to retrieve the element's visible text content. Defaults to true.",
                        default: true
                    },
                    get_inner_html: {
                        type: "boolean",
                        description: "Optional. Set to true to retrieve the element's inner HTML content. Use with caution, can be large. Defaults to false.",
                        default: false
                    }
                },
                required: ["selector"]
            }
        }
    },
    {
        type: "function", function: {
            name: "reportFound", description: "Called when the bug is found", parameters: {
                type: "object", properties: {}
            }
        }
    },
    {
        type: "function", function: {
            name: "reportNotFound",
            description: "Called when the bug is not found after attempting to recreate it",
            parameters: {
                type: "object", properties: {}
            }
        }
    }
];
