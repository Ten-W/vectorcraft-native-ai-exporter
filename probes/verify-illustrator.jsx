// Verification only. This is never part of the independent exporter runtime.
// Run this file through Illustrator's File > Scripts > Other Script.
(function () {
    var config = new File(File($.fileName).parent + '/verify-config.json');
    config.encoding = 'UTF-8';
    if (!config.open('r')) throw Error('Missing verify-config.json');
    var rawSettings=config.read();config.close();
    // ExtendScript has no dependable JSON.parse. Accept exactly three JSON string fields,
    // never eval config content (a copied verification folder is still an input boundary).
    var settings={},tokens=0;
    function unquote(s){return s.replace(/\\(?:u[0-9a-fA-F]{4}|["\\\/bfnrt])/g,function(x){if(x.charAt(1)==='u')return String.fromCharCode(parseInt(x.slice(2),16));return {'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'}[x.charAt(1)];});}
    var remaining=rawSettings.replace(/"(input|saved|report)"\s*:\s*"((?:\\(?:u[0-9a-fA-F]{4}|["\\\/bfnrt])|[^"\\\x00-\x1f])*)"/g,function(all,key,value){if(settings.hasOwnProperty(key))throw Error('Duplicate setting');settings[key]=unquote(value);tokens++;return '@';}).replace(/\s/g,'');
    if(tokens!==3 || remaining!=='{@,@,@}')throw Error('Invalid verification settings');
    if(!/^[a-z]:[\\\/]/i.test(settings.input)||!/^[a-z]:[\\\/]/i.test(settings.saved)||!/^[a-z]:[\\\/]/i.test(settings.report))throw Error('Only absolute local Windows paths are allowed');
    if(new File(settings.input).fsName.toLowerCase()===new File(settings.saved).fsName.toLowerCase())throw Error('Cannot overwrite input');
    function encode(v) {
        function q(s) { return '"' + String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t').replace(/[\x00-\x1f]/g,function(c){return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);}) + '"'; }
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'string') return q(v);
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        var out=[],i;
        if (v instanceof Array) {for(i=0;i<v.length;i++)out.push(encode(v[i]));return '['+out.join(',')+']';}
        for(i in v)if(v.hasOwnProperty(i))out.push(q(i)+':'+encode(v[i]));
        return '{'+out.join(',')+'}';
    }
    var doc, old=app.userInteractionLevel;
    var report={illustratorVersion:app.version,passed:false,stage:'starting'};
    function write() {var f=new File(settings.report);f.encoding='UTF-8';if(!f.open('w'))throw Error('Cannot write verification report');f.write(encode(report));f.close();}
    function inspect(d) {
        var texts=[],parents=[],i;
        for(i=0;i<d.textFrames.length;i++) {var t=d.textFrames[i];texts.push({contents:t.contents,font:t.textRange.characterAttributes.textFont.name,size:t.textRange.characterAttributes.size,position:t.position});parents.push(t.parent.typename);}
        return {artboards:d.artboards.length,layers:d.layers.length,groups:d.groupItems.length,paths:d.pathItems.length,rasters:d.rasterItems.length,texts:texts,textParents:parents};
    }
    try {
        write();
        app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
        report.stage='opening';write();
        doc=app.open(new File(settings.input));
        report.before=inspect(doc);
        report.stage='editing';write();
        if(!doc.textFrames.length)throw Error('No editable native text objects');
        var found=false;
        for(var i=0;i<doc.textFrames.length;i++)if(doc.textFrames[i].contents.indexOf('\u4e2d\u6587\u5c3a\u5bf8')>=0)found=true;
        if(!found)throw Error('Chinese text did not survive');
        var t=doc.textFrames[0],original=t.contents;
        t.contents=original+'\u9a8c\u8bc1';
        if(t.contents!==original+'\u9a8c\u8bc1')throw Error('Text edit failed');
        t.contents=original;
        report.textEditPassed=true;
        report.stage='saving';write();
        if(new File(settings.saved).exists)throw Error('Verification save destination exists');
        var options=new IllustratorSaveOptions();options.pdfCompatible=true;options.compressed=true;
        doc.saveAs(new File(settings.saved),options);
        doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;
        report.stage='reopening';write();
        doc=app.open(new File(settings.saved));report.after=inspect(doc);
        report.passed=report.before.texts.length===report.after.texts.length && report.before.groups===report.after.groups;
        report.stage='complete';write();
    }catch(e){report.error=String(e);report.line=e.line;write();}
    finally{if(doc){try{doc.close(SaveOptions.DONOTSAVECHANGES);}catch(ignore){}}app.userInteractionLevel=old;}
})();
