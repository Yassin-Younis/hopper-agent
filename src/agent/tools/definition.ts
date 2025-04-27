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
                    type: "string", description: "The field's unique identifier."
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
                id: {type: "string", description: "The element's unique identifier."}, button: {
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
                id: {type: "string", description: "The element's unique identifier."}, button: {
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
                id: {type: "string", description: "The element's unique identifier."}
            }, required: ["id"]
        }
    }
}, {
    type: "function", function: {
        name: "press", description: "Simulates a key press event on an element.", parameters: {
            type: "object", properties: {
                id: {type: "string", description: "The element's unique identifier."},
                key_comb: {type: "string", description: "The key combination to press."}
            }, required: ["id", "key_comb"]
        }
    }
}, {
    type: "function", function: {
        name: "focus", description: "Focuses an input field or element.", parameters: {
            type: "object", properties: {
                id: {type: "string", description: "The element's unique identifier."}
            }, required: ["id"]
        }
    }
}, {
    type: "function", function: {
        name: "clear", description: "Clears the contents of an input field.", parameters: {
            type: "object", properties: {
                id: {type: "string", description: "The element's unique identifier."}
            }, required: ["id"]
        }
    }
}, {
    type: "function", function: {
        name: "drag_and_drop", description: "Drags an element and drops it onto another.", parameters: {
            type: "object", properties: {
                from_id: {type: "string", description: "The element to drag."},
                to_id: {type: "string", description: "The target drop location."}
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
    //                 id: {type: "string", description: "The file input's unique identifier."},
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
