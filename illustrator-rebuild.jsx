// Loaded by vectorcraft-to-illustrator.cjs. Uses Illustrator's own object model.
(function () {
    // ExtendScript does not provide JSON in every Illustrator version.
    var JSON={stringify:function(v){
        function q(s){return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t').replace(/[\x00-\x1f\u2028\u2029]/g,function(c){return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';}
        if(v===null||v===undefined)return 'null';if(typeof v==='string')return q(v);if(typeof v==='number'||typeof v==='boolean')return String(v);
        var out=[],i;if(v instanceof Array){for(i=0;i<v.length;i++)out.push(JSON.stringify(v[i]));return '['+out.join(',')+']';}
        for(i in v)if(v.hasOwnProperty(i))out.push(q(i)+':'+JSON.stringify(v[i]));return '{'+out.join(',')+'}';
    }};
    var D = VC_DATA, source = D.document, warnings = [], missingFonts = {}, nodeMap = {}, savedInteraction = app.userInteractionLevel;
    var doc, tempLayer, fontCache = {}, layers = [], texts = [], stage='initializing';
    var liveStrokes=[],actionCache={},actionSets=[],nativeWidths={},actionSerial=0;
    // Illustrator arrowheads are not exposed by the scripting DOM. A temporary
    // ai_plugin_setStroke action writes the native stroke attributes instead.
    function utf8hex(s){var u=unescape(encodeURIComponent(s)),h='';for(var i=0;i<u.length;i++)h+=('0'+u.charCodeAt(i).toString(16)).slice(-2);return h;}
    function actionString(s){var h=utf8hex(s);return '[ '+h.length/2+'\n'+h+'\n]';}
    function nativeArrowName(kind){
        if(!kind)return app.locale==='zh_CN'?'[\u65e0]':'[None]';
        var id;if(kind==='Triangle')id=7;else if(kind==='Circle')id=21;else throw Error('Unsupported LIVE arrowhead '+kind);
        return (app.locale==='zh_CN'?'\u7bad\u5934 ':'Arrow ')+id;
    }
    function runStrokeAction(item,start,end,s0,s1,tip){
        if(app.locale!=='zh_CN'&&app.locale.indexOf('en')!==0)throw Error('Native arrow actions currently support Chinese Simplified and English Illustrator only');
        var key=[start,end,s0,s1,tip].join('|'),entry=actionCache[key];
        if(!entry){
            var name='VC_LiveArrows_'+(++actionSerial),fields=[
                [1634231345,'ustring',actionString(nativeArrowName(start))],
                [1634231346,'ustring',actionString(nativeArrowName(end))],
                [1634951985,'real',String(s0)],[1634951986,'real',String(s1)],
                [1634230636,'enumerated',tip?'0':'1']
            ];
            var lines=['/version 3','/name '+actionString(name),'/isOpen 1','/actionCount 1','/action-1 {','/name '+actionString('Apply'),'/keyIndex 0','/colorIndex 0','/isOpen 1','/eventCount 1','/event-1 {','/internalName (ai_plugin_setStroke)','/localizedName [ 0\n]','/isOpen 1','/isOn 1','/hasDialog 0','/parameterCount '+fields.length];
            for(var i=0;i<fields.length;i++){var f=fields[i];lines.push('/parameter-'+(i+1)+' {','/key '+f[0],'/showInPalette 4294967295','/type ('+f[1]+')');if(f[1]==='enumerated')lines.push('/name [ 0\n]');lines.push('/value '+f[2],'}');}
            lines.push('}','}');var af=new File(D.actionFolder+'/'+name+'.aia');af.encoding='BINARY';if(!af.open('w'))throw Error('Cannot write temporary Illustrator action');af.write(lines.join('\n')+'\n');af.close();
            app.loadAction(af);entry={name:name};actionCache[key]=entry;actionSets.push(name);
        }
        doc.selection=null;item.selected=true;app.doScript('Apply',entry.name,false);item.selected=false;
    }
    function calibrateArrow(kind){
        if(nativeWidths[kind])return nativeWidths[kind];
        var p=doc.pathItems.add();p.setEntirePath([[20,-20],[320,-20]]);p.filled=false;p.stroked=true;p.strokeWidth=1;var black=new CMYKColor();black.black=100;p.strokeColor=black;
        try{runStrokeAction(p,kind,kind,100,100,false);app.redraw();var b=p.visibleBounds,w=b[1]-b[3];if(w<2)throw Error('Illustrator rejected native '+kind+' arrow');nativeWidths[kind]=w;return w;}finally{p.remove();}
    }
    function applyLiveStroke(item,n){
        var list=n.appearance?n.appearance.items:[];
        for(var i=0;i<list.length;i++){
            var s=list[i];if(s.kind!=='stroke'||(!s.start_arrow&&!s.end_arrow))continue;
            var scales=s.arrow_scale||[100,100],width=s.width||1;
            var s0=s.start_arrow?400*Math.max(width*scales[0]/100,0.25)/(width*calibrateArrow(s.start_arrow)):100;
            var s1=s.end_arrow?400*Math.max(width*scales[1]/100,0.25)/(width*calibrateArrow(s.end_arrow)):100;
            runStrokeAction(item,s.start_arrow,s.end_arrow,s0,s1,s.arrow_align==='Tip');
            liveStrokes.push({id:n.id,width:width,kind:s.start_arrow||s.end_arrow});
        }
    }
    function warn(s) { warnings.push(s); }
    function color(c) {
        var out;
        if (!c) return new NoColor();
        if (c.model === 'cmyk') { out = new CMYKColor(); out.cyan=c.c*100;out.magenta=c.m*100;out.yellow=c.y*100;out.black=c.k*100; }
        else if (c.model === 'gray') { out=new GrayColor();out.gray=(c.gray === undefined ? c.value : c.gray)*100; }
        else if (c.model === 'rgb') { out=new RGBColor();out.red=c.r*255;out.green=c.g*255;out.blue=c.b*255; }
        else throw Error('Unsupported color model: '+c.model);
        return out;
    }
    function paint(p) { if (!p || p.type==='none') return new NoColor();if(p.type!=='solid')throw Error('Unsupported paint: '+p.type);return color(p.color); }
    function font(family, style) {
        var key=family+'|'+style, f, i;
        if (fontCache[key]) return fontCache[key];
        for(i=0;i<app.textFonts.length;i++){f=app.textFonts[i];if(f.family===family&&f.style===style){fontCache[key]=f;return f;}}
        if(family==='Alibaba PuHuiTi 2.0'){
            try{f=app.textFonts.getByName('AlibabaPuHuiTi_2_'+style.replace(/ /g,'_'));fontCache[key]=f;return f;}catch(ignored){}
            for(i=0;i<app.textFonts.length;i++){f=app.textFonts[i];if(f.name.indexOf('AlibabaPuHuiTi_2_')===0&&f.style.replace(/^[0-9]+\s*/,'')===style.replace(/^[0-9]+\s*/,'')){fontCache[key]=f;return f;}}
        }
        try{f=app.textFonts.getByName(family.replace(/ /g,'')+(style==='Regular'?'':'-'+style.replace(/ /g,'')));fontCache[key]=f;return f;}catch(ignored2){}
        try{f=app.textFonts.getByName(family.replace(/ /g,'')+(style==='Regular'?'':style.replace(/ /g,'')));fontCache[key]=f;return f;}catch(ignored3){}
        // The display family in Illustrator can omit the space before the version number.
        var fam=family.replace(/[^a-z0-9]/gi,'').toLowerCase(), sty=style.replace(/[^a-z0-9]/gi,'').toLowerCase();
        for(i=0;i<app.textFonts.length;i++){f=app.textFonts[i];if(f.family.replace(/[^a-z0-9]/gi,'').toLowerCase()===fam&&f.style.replace(/[^a-z0-9]/gi,'').toLowerCase()===sty){fontCache[key]=f;return f;}}
        missingFonts[key]=true;
        throw Error('Font/style not installed in Illustrator: '+key);
    }
    function common(item,n){
        item.name=n.name||('VC_'+n.id);item.note='VectorCraft source id: '+n.id;
        if(n.opacity!==undefined)item.opacity=n.opacity*100;
        nodeMap[n.id]=item;
    }
    function pathPaint(item,n){
        var list=n.appearance?n.appearance.items:[],fills=0,strokes=0,i,a;
        item.filled=false;item.stroked=false;
        for(i=0;i<list.length;i++){
            a=list[i];
            if(a.kind==='fill'){fills++;if(a.paint&&a.paint.type!=='none'){item.filled=true;item.fillColor=paint(a.paint);}}
            if(a.kind==='stroke'){strokes++;if(a.paint&&a.paint.type!=='none'){item.stroked=true;item.strokeColor=paint(a.paint);item.strokeWidth=a.width===undefined?1:a.width;}}
        }
        if(fills>1||strokes>1)throw Error('Multiple appearance paints require a dedicated converter: #'+n.id);
    }
    function subpath(parent,sp){
        var item=parent.pathItems.add(),i,p,a;
        item.setEntirePath((function(){var z=[];for(var j=0;j<sp.anchors.length;j++)z.push([sp.anchors[j].p[0],-sp.anchors[j].p[1]]);return z;})());
        for(i=0;i<sp.anchors.length;i++){a=sp.anchors[i];p=item.pathPoints[i];p.leftDirection=a['in']?[a['in'][0],-a['in'][1]]:p.anchor;p.rightDirection=a.out?[a.out[0],-a.out[1]]:p.anchor;if(a.kind==='Smooth')p.pointType=PointType.SMOOTH;else p.pointType=PointType.CORNER;}
        item.closed=!!sp.closed;return item;
    }
    function makePath(parent,n){
        var s=n.kind.path.subpaths,item,i;
        if(s.length===1){item=subpath(parent,s[0]);pathPaint(item,n);}
        else {item=parent.compoundPathItems.add();for(i=0;i<s.length;i++)subpath(item,s[i]);if(item.pathItems.length)pathPaint(item.pathItems[0],n);}
        common(item,n);applyLiveStroke(item,n);return item;
    }
    function normalize(s){return s.replace(/\r\n/g,'\r').replace(/[\n\u2028\u2029]/g,'\r');}
    function charStyle(a,s){
        a.textFont=font(s.font_family,s.font_style);a.size=s.size;
        a.tracking=s.tracking||0;a.baselineShift=s.baseline_shift||0;
        a.horizontalScale=s.h_scale===undefined?100:s.h_scale;a.verticalScale=s.v_scale===undefined?100:s.v_scale;
        a.rotation=s.rotation||0;a.fillColor=paint(s.fill);a.strokeColor=paint(s.stroke);a.strokeWeight=s.stroke_width||0;
        a.underline=!!s.underline;a.strikeThrough=!!s.strikethrough;
        if(s.leading!==undefined){a.autoLeading=false;a.leading=s.leading;}else{a.autoLeading=true;}
    }
    function makeText(parent,n){
        var k=n.kind,tf,i,j,at=0,r,s,content='',m,x=k.xf;
        if(k.kind.kind!=='point')throw Error('This converter currently supports point text only: #'+n.id);
        stage='text add #'+n.id;tf=parent.textFrames.pointText([0,0]);
        for(i=0;i<k.runs.length;i++)content+=normalize(k.runs[i].text);
        stage='text contents #'+n.id;tf.contents=content;
        stage='text styling #'+n.id;
        for(i=0;i<k.runs.length;i++){r=k.runs[i];s=normalize(r.text);for(j=0;j<s.length;j++){if(at<tf.characters.length)charStyle(tf.characters[at].characterAttributes,r.style);at++;}}
        if(k.para){
            var p=tf.textRange.paragraphAttributes,q=k.para;
            // ExtendScript mis-evaluates Illustrator enum values in nested ternaries.
            if(q.justify==='Center')p.justification=Justification.CENTER;
            else if(q.justify==='Right')p.justification=Justification.RIGHT;
            else p.justification=Justification.LEFT;
            p.leftIndent=q.left_indent||0;p.rightIndent=q.right_indent||0;p.firstLineIndent=q.first_line_indent||0;p.spaceBefore=q.space_before||0;p.spaceAfter=q.space_after||0;p.hyphenation=!!q.hyphenate;
        }
        m=app.getIdentityMatrix();m.mValueA=x[0];m.mValueB=-x[1];m.mValueC=-x[2];m.mValueD=x[3];m.mValueTX=x[4];m.mValueTY=-x[5];
        stage='text transform #'+n.id;tf.transform(m,true,true,true,true,100,Transformation.DOCUMENTORIGIN);
        common(tf,n);texts.push({id:n.id,desired:k.para.justify,alignment:String(tf.textRange.paragraphAttributes.justification)});return tf;
    }
    function makeImage(parent,n){
        var k=n.kind,r=k.exportRect,item=parent.placedItems.add();
        item.file=new File(k.exportFile);item.width=r[2];item.height=r[3];item.position=[r[0],-r[1]];
        common(item,n);item.embed();return null;
    }
    function make(parent,n){
        stage='make '+n.kind.type+' #'+n.id;
        var k=n.kind,item,i;
        if(k.type==='layer'){
            item=parent.layers.add();item.name=n.name||('Layer '+n.id);layers.push({item:item,node:n});
            for(i=0;i<k.children.length;i++)make(item,k.children[i]);return item;
        }
        if(k.type==='group'){
            item=parent.groupItems.add();common(item,n);
            for(i=0;i<k.children.length;i++)make(item,k.children[i]);
            if(k.clip)throw Error('Clipping groups need an explicit clipping path mapping: #'+n.id);
        }else if(k.type==='path')item=makePath(parent,n);
        else if(k.type==='text')item=makeText(parent,n);
        else if(k.type==='image')item=makeImage(parent,n);
        else throw Error('Unsupported kind '+k.type);
        if(item){if(n.visible===false)item.hidden=true;if(n.locked)item.locked=true;}
        return item;
    }
    function writeJson(file,value){var f=new File(file);f.encoding='UTF-8';f.open('w');f.write(JSON.stringify(value,null,2));f.close();}
    function audit(d){var c=[],i;for(i=0;i<d.textFrames.length;i++)c.push(d.textFrames[i].contents);return {artboards:d.artboards.length,layers:d.layers.length,textFrames:d.textFrames.length,groups:d.groupItems.length,paths:d.pathItems.length,contents:c};}
    function verifyLiveArrows(d){
        var checked={},result=[];
        for(var i=0;i<liveStrokes.length;i++){
            var info=liveStrokes[i];if(checked[info.kind])continue;
            var p=null;for(var j=0;j<d.pathItems.length;j++)if(d.pathItems[j].note==='VectorCraft source id: '+info.id){p=d.pathItems[j];break;}
            if(!p||p.pathPoints.length!==2)continue;
            var a=p.pathPoints[0].anchor,b=p.pathPoints[1].anchor;if(Math.abs(a[1]-b[1])>0.01)continue;
            app.redraw();var before=p.visibleBounds,weight=p.strokeWidth,h=before[1]-before[3];
            if(h<=weight*1.5)throw Error('Saved path lost its native '+info.kind+' arrowheads');
            p.strokeWidth=weight*2;app.redraw();var grown=p.visibleBounds,grownH=grown[1]-grown[3];
            p.strokeWidth=weight;
            if(Math.abs(grownH-2*h)>0.12)throw Error('Native arrow did not scale dynamically: '+info.id);
            p.pathPoints[1].anchor=[b[0]+10,b[1]];app.redraw();var changed=p.pathPoints[1].anchor;p.pathPoints[1].anchor=b;
            if(Math.abs(changed[0]-b[0]-10)>0.01)throw Error('Native arrow endpoint edit failed');
            checked[info.kind]=true;result.push(info.kind+': live stroke scaling and endpoint edit passed');
        }
        for(var kind in nativeWidths)if(!checked[kind])throw Error('No live-arrow verification sample for '+kind);
        return result;
    }
    try {
        app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
        var ab=source.artboards[0].rect;
        if(source.color_mode==='Cmyk')doc=app.documents.add(DocumentColorSpace.CMYK,ab.x1-ab.x0,ab.y1-ab.y0);
        else doc=app.documents.add(DocumentColorSpace.RGB,ab.x1-ab.x0,ab.y1-ab.y0);
        tempLayer=doc.layers[0];doc.rulerOrigin=[0,0];
        for(var i=0;i<source.artboards.length;i++){var a=source.artboards[i],rect=[a.rect.x0,-a.rect.y0,a.rect.x1,-a.rect.y1];if(i===0)doc.artboards[0].artboardRect=rect;else doc.artboards.add(rect);doc.artboards[i].name=a.name;}
        // Preflight all fonts before adding artwork.
        function preflight(ns){for(var j=0;j<ns.length;j++){var k=ns[j].kind;if(k.type==='text')for(var z=0;z<k.runs.length;z++)font(k.runs[z].style.font_family,k.runs[z].style.font_style);if(k.children)preflight(k.children);}}
        preflight(source.layers);
        for(i=0;i<source.layers.length;i++)make(doc,source.layers[i]);
        tempLayer.remove();
        for(i=0;i<layers.length;i++){var l=layers[i];l.item.visible=l.node.visible!==false;l.item.locked=!!l.node.locked;}
        app.redraw();
        var before=audit(doc), opts=new IllustratorSaveOptions();opts.pdfCompatible=true;opts.compressed=true;opts.embedLinkedFiles=true;opts.embedICCProfile=true;
        doc.saveAs(new File(D.output),opts);
        // Verify Illustrator's own saved file, including text contents, after closing/reopening it.
        doc.close(SaveOptions.DONOTSAVECHANGES);doc=app.open(new File(D.output));
        var after=audit(doc),ok=before.artboards===after.artboards&&before.layers===after.layers&&before.textFrames===after.textFrames&&before.groups===after.groups;
        before.contents.sort();after.contents.sort();if(before.contents.join('\u0001')!==after.contents.join('\u0001'))ok=false;
        if(after.textFrames!==D.expected.text)ok=false;
        if(after.paths!==before.paths)ok=false;
        var liveTests=verifyLiveArrows(doc);
        for(i=0;i<doc.textFrames.length;i++){
            var nt=doc.textFrames[i],sid=Number(nt.note.replace('VectorCraft source id: ',''));
            for(var j=0;j<texts.length;j++)if(texts[j].id===sid){if(String(nt.textRange.paragraphAttributes.justification)!==texts[j].alignment)ok=false;break;}
        }
        if(after.textFrames){var t=doc.textFrames[0],old=t.contents,probe=t.duplicate();probe.contents=old+' X';if(probe.contents!==old+' X')throw Error('Text edit verification failed');probe.remove();t.translate(1,-1);t.translate(-1,1);doc.save();}
        var png=new ExportOptionsPNG24();png.artBoardClipping=true;png.transparency=false;png.horizontalScale=55;png.verticalScale=55;doc.artboards.setActiveArtboardIndex(0);doc.exportFile(new File(D.preview),ExportType.PNG24,png);
        doc.selection=null;doc.views[0].centerPoint=[(ab.x0+ab.x1)/2,-(ab.y0+ab.y1)/2];doc.views[0].zoom=0.5;
        var report={verified:ok,illustratorVersion:app.version,inputTitle:source.title,artboards:after.artboards,layers:after.layers,textFrames:after.textFrames,groups:after.groups,paths:after.paths,textEditTest:true,movementTest:true,warnings:warnings,bitmapMasksBaked:true,liveMarkers:D.markers,liveArrowTests:liveTests,nativeArrowIds:{Triangle:7,Circle:21},textAlignments:texts};
        writeJson(D.report,report);return JSON.stringify({verified:ok,artboards:after.artboards,textFrames:after.textFrames,groups:after.groups,movementTest:true});
    } catch(e){writeJson(D.report,{verified:false,error:String(e),line:e.line,stage:stage,warnings:warnings});if(doc){try{doc.close(SaveOptions.DONOTSAVECHANGES);}catch(ignoreClose){}}throw e;}
    finally{for(var ai=0;ai<actionSets.length;ai++){try{app.unloadAction(actionSets[ai],'');}catch(ignoreAction){}}app.userInteractionLevel=savedInteraction;}
})();
