// teste de ponta a ponta da página: npm test (precisa do servidor rodando e do doc 'exemplo' publicado; CHROME=<caminho do Chrome>)
const p=require('puppeteer-core');const W=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await p.launch({executablePath:process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--window-size=1500,1100']});
const pg=await b.newPage();await pg.setViewport({width:1500,height:1100});const R={};
pg.on('pageerror',e=>R.erro=(R.erro||'')+e.message);
await pg.goto('http://localhost:'+(process.env.REPLICA_PORT||7743)+'/exemplo');await W(1500);
await pg.screenshot({path:require('os').tmpdir()+'/replica-1.png'});
R.cartoes=await pg.$$eval('.cartao',x=>x.length);
// teclado: foco no doc, Tab até o primeiro radio, seta pra baixo
await pg.focus('#doc');await pg.evaluate(()=>caretEm(D.blocos[0].id,0));
await pg.keyboard.press('Tab');R.tab1=await pg.evaluate(()=>document.activeElement.outerHTML.slice(0,80));
await pg.keyboard.press('ArrowDown');await pg.keyboard.press('ArrowDown');await W(800);
R.radio=await pg.evaluate(()=>E);
// checkbox por espaço
await pg.keyboard.press('Tab');await pg.keyboard.press('Space');await W(800);
// texto: caret no parágrafo, Ctrl+Shift+Right 2x, Tab
const last=await pg.evaluate(()=>D.blocos.at(-1).id);
await pg.evaluate(id=>caretEm(id,0),last);
await pg.keyboard.down('Control');await pg.keyboard.down('Shift');await pg.keyboard.press('ArrowRight');await pg.keyboard.press('ArrowRight');await pg.keyboard.up('Shift');await pg.keyboard.up('Control');
R.sel=await pg.evaluate(()=>getSelection().toString());
await pg.keyboard.press('Tab');await W(300);
R.focoComent=await pg.evaluate(()=>document.activeElement.id);
await pg.keyboard.type('teste teclado');
await pg.keyboard.down('Control');await pg.keyboard.press('Enter');await pg.keyboard.up('Control');await W(1200);
R.depoisEnvio=await pg.evaluate(()=>({ativo:document.activeElement.id,caretBloco:(blocoDo(getSelection().anchorNode)||{}).dataset?.b,off:getSelection().anchorOffset,fios:C.length}));
// mouse: seleciona com arraste e clica na bolha
const box=await pg.evaluate(id=>{const r=document.querySelector('.blk[data-b="'+id+'"] p').getBoundingClientRect();return {x:r.x,y:r.y+10}},last);
await pg.mouse.move(box.x+5,box.y);await pg.mouse.down();await pg.mouse.move(box.x+200,box.y,{steps:5});await pg.mouse.up();await W(300);
await pg.click('#bolha');await W(400);R.focoMouse=await pg.evaluate(()=>document.activeElement.id);
await pg.keyboard.type('rascunho que nao pode sumir');await pg.reload();await W(1500);
R.rascunho=await pg.evaluate(()=>($('#novoTxt')||{}).value);
await pg.screenshot({path:require('os').tmpdir()+'/replica-2.png'});
console.log(JSON.stringify(R,null,1));await b.close()})();
