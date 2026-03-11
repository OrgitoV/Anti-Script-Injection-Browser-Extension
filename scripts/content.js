const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) =>{
        mutation.addedNodes.forEach((node) => {
            //Check for <script> tags
            if(node.nodeName === 'SCRIPT'){
                console.log('SCRIPT Detected: ', node.src || 'inline');
                //Take action here: Remove/Analyze/Block
            }
            //Check inline event handlers
            if(node.nodeType === 1){
                const attrs = node.attributes;
                for(let attr of attrs){
                    if(attr.name.startsWith('on')){
                        console.log('Event handler found: ', attr.name);
                    }
                }
            }
        });
    });
});

const configs = {
    childList: true, //Watch for added/removed children
    subtree: true, //Watch all descendants
    attributes: true, //Watch attribute changes
    attributeFilter: ['onclick', 'onerror', 'onload']
    //attributeOldValue: true, //Record old attribute values
    //characterData: true // Watch text context changes
}

observer.observe(document.documentElement, configs);
window.addEventListener('beforeunload', () => {
    observer.disconnect();
})

//Important question (try to limit AI giving you answers): What characteristics would you use to 
//determine if a script is safe or dangerous? Think about where scripts load from and what they might contain

//Determine trusted script sources/domains (like if the source matches parts of the site's domain)