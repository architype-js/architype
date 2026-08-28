import type { Plugin } from "@docusaurus/types"

export default function simpleAnalyticsPlugin(): Plugin {
    return {
        name: "simple-analytics",
        injectHtmlTags() {
            return {
                postBodyTags: [
                    {
                        tagName: "script",
                        attributes: {
                            src: "https://scripts.simpleanalyticscdn.com/latest.js",
                            awaited: true,
                            "data-collect-dnt": true
                        }
                    },
                    {
                        tagName: "noscript",
                        innerHTML:
                            '<img src="https://queue.simpleanalyticscdn.com/noscript.gif?collect-dnt=true" alt="" referrerpolicy="no-referrer-when-downgrade"/>'
                    }
                ]
            }
        }
    }
}
