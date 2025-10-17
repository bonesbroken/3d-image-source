import $ from "jquery";
import * as THREE from 'three';
import { ArcballControls } from 'three/addons/controls/ArcballControls.js';
import '@shoelace-style/shoelace/dist/themes/dark.css';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/range/range.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/details/details.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';
setBasePath('./shoelace');

// streamlabs api variables
let streamlabs, streamlabsOBS;
let settings = {};
let canAddSource = false;
let scene, camera, controls, renderer, resizeObserver, imagePlane;
const manager = new THREE.LoadingManager();
const textureLoader = new THREE.TextureLoader();
let existingSource;
let renderCalls = [];
const mouse = new THREE.Vector2();
let windowHalf = new THREE.Vector2(0, 0);
let clock = new THREE.Clock(true);


async function loadShoelaceElements() {
    await Promise.allSettled([
        customElements.whenDefined('sl-range'),
        customElements.whenDefined('sl-icon'),
        customElements.whenDefined('sl-select'),
        customElements.whenDefined('sl-details'),
        customElements.whenDefined('sl-range')
    ]);
}

$(function() {
    loadShoelaceElements();
    startManager();
    updateUI('new');
    initApp();
});

function startManager() {
    manager.onLoad = function () {
    };

    requestAnimationFrame(startManager);
    renderCalls.forEach((callback) => {
        callback();
    });
}

function renderScene() {
    const delta = clock.getDelta();
    //const hasControlsUpdated = controls.update( delta );
    renderer.render(scene, camera);
}


function threeJSScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera( 65, $("#threeCanvas").width() / $("#threeCanvas").height(), 0.01, 50 );
    camera.position.z = 1;
    scene.add(camera);

    controls = new ArcballControls( camera, $("#threeCanvas")[0], scene );
    controls.enableAnimations = true;
    controls.dampingFactor = 5;
    controls.wMax = 5;
    
    controls.enabled = true;
    controls.enableFocus = true;
    controls.enableGrid = false;
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.cursorZoom = false;
    controls.adjustNearFar = false;
    controls.scaleFactor = 1.5
    controls.minDistance = 0;
    controls.maxDistance = 10;
    controls.enableFocus = true;
    controls.setGizmosVisible( true );
    
    controls.addEventListener( 'change', function () {
        renderer.render( scene, camera );
    });

    let defaultMat = new THREE.MeshBasicMaterial();
    defaultMat.needsUpdate = true;
    imagePlane = new THREE.Mesh( new THREE.PlaneGeometry( 1, 1 ), defaultMat );
    setObjectMaterial(imagePlane, './images/defaultImage.png');
    scene.add( imagePlane );

    renderer = new THREE.WebGLRenderer({
        canvas: $("#threeCanvas")[0],
        logarithmicDepthBuffer: false,
        antialias: true,
        stencil: false,
        alpha: true
    });

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize($("#threeCanvas").width(), $("#threeCanvas").height(), false);
    renderCalls.push(renderScene);

    function resizeCanvasToDisplaySize() {
        const canvas = renderer.domElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        windowHalf.set( width / 2, height / 2 );
    
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        renderer.render(scene, camera);
    }

    resizeObserver = new ResizeObserver(resizeCanvasToDisplaySize);
    resizeObserver.observe(renderer.domElement, {box: 'content-box'});
}

async function initApp() {
    streamlabs = window.Streamlabs;
    streamlabs.init().then(async () => {
        streamlabsOBS = window.streamlabsOBS;
        streamlabsOBS.apiReady.then(() => {
            canAddSource = true;
            threeJSScene();
        });

        streamlabsOBS.v1.App.onNavigation(nav => {

            if(nav.sourceId) {
                // Accesses via existing source, load source settings
                console.log('Accessed via existing source');

                streamlabsOBS.v1.Sources.getAppSourceSettings(nav.sourceId).then(settingsString => {
                    existingSource = nav.sourceId;
                    console.log('Existing source ID:', existingSource, settingsString);
                    
                    // Parse settings if they exist
                    let parsedSettings = null;
                    if (settingsString) {
                        try {
                            settings = JSON.parse(settingsString);
                            console.log('Parsed settings:', settings);

                            if(imagePlane && settings && settings.raw) {
                                setObjectMaterial(imagePlane, settings.raw);
                            }
                        } catch (error) {
                            console.error('Failed to parse settings:', error);
                        }
                    }
                    
                    updateUI('existing');
                });  
            } else {
                existingSource = null;
                // Accesses via side nav, load saved settings
                console.log('Accessed via side nav');
                updateUI('new');
                renderer.render(scene, camera);
            }
        });
    });
}


function updateUI(newSource) {

    if(newSource === 'new') {
        $('#saveAppSource').hide();
    } else {
        $('#saveAppSource').show();
    }
}

$('input.image-input').on('change', event => {
    let elem = $(event.target);
    let applyElem = elem.siblings('.apply-button');
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    
    const selectedFile = event.target.files[0];
    if (selectedFile) {
        if (!validTypes.includes(selectedFile.type)) {
            showAlert('#generalAlert', 'Invalid file type.', 'Please select a JPG or PNG file.');
            elem[0].value = '';
            return;
        }

        if ((selectedFile.size / (1024 * 1024)) > 10) {
            showAlert('#generalAlert', 'File size too large.', 'Please upload a file less than 10 MB.');
            elem[0].value = '';
            return;
        }
        $('#spinner').show();
        console.log('Uploading asset:', selectedFile.name);

        streamlabs.userSettings.addAssets([ { name: `${selectedFile.name}_raw`, file: selectedFile } ]).then(result => {
            settings.raw = result[`${selectedFile.name}_raw`];
            console.log(`${selectedFile.name}_raw`, settings.raw);
            if(imagePlane) setObjectMaterial(imagePlane, settings.raw);
            renderer.render(scene, camera);
            
        }).catch(error => {
            console.error('Error uploading asset:', error);
            $('#spinner').hide();
        });
    }
});

function setObjectMaterial(obj, url) {
    if(!url) return;
    var size = 2048;
    let canvas = document.createElement( 'canvas' );
    canvas.width = size;
    canvas.height = size;
    
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = function() {
        const canvasAspect = canvas.width / canvas.height;
        const imgAspect = img.width / img.height;
        
        let drawWidth, drawHeight, drawX, drawY;
        
        if (canvasAspect > imgAspect) {
            // Canvas is wider than image, fit to height
            drawHeight = canvas.height;
            drawWidth = drawHeight * imgAspect;
            drawX = (canvas.width - drawWidth) / 2;
            drawY = 0;
        } else {
            // Canvas is taller than image, fit to width
            drawWidth = canvas.width;
            drawHeight = drawWidth / imgAspect;
            drawX = 0;
            drawY = (canvas.height - drawHeight) / 2;
        }
        
        // Draw the image with proper aspect ratio
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        const canvasTexture = new THREE.CanvasTexture(canvas);
        canvasTexture.colorSpace = THREE.SRGBColorSpace;
        canvasTexture.needsUpdate = true;
        let newMaterial = new THREE.MeshBasicMaterial({ 
            map: canvasTexture,
            side: THREE.DoubleSide,
            transparent: true
        });
        newMaterial.needsUpdate = true;
        obj.material = newMaterial;
        $('#spinner').hide();
    };
    
    img.src = url;
}

$(".image-upload").on('click', function(event) { 
    let elem = $(this);
    let inputElem = elem.closest('sl-details').children('input.image-input');
    inputElem.trigger('click');
});

$("#saveAppSource").on('click', () => { 
    console.log('canAddSource', canAddSource);
    console.log('existingSource', existingSource);
    if(!canAddSource) return;

    if(existingSource) {
        $('#saveSpinner').show();
        controls.setGizmosVisible( false );
        renderScene();
        const imgData = $("#threeCanvas")[0].toDataURL("image/png");
        const currentDate = new Date().toISOString();

        const byteString = atob(imgData.split(',')[1]);
        const mimeString = imgData.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const screenshotFile = new File([ab], `${currentDate}.png`, { type: mimeString });
        streamlabs.userSettings.addAssets([ { name: currentDate, file: screenshotFile } ]).then(result => {
            settings.imageURL = result[currentDate];

            streamlabsOBS.v1.Sources.setAppSourceSettings(existingSource, JSON.stringify(settings));
            $('#saveSpinner').hide();
            controls.setGizmosVisible( true );
            streamlabsOBS.v1.App.navigate('Editor');
            existingSource = null;
        }).catch(error => {
            console.error('Error saving asset:', error);
        });
    }
});


$("#addAppSource").on('click', () => { 
    if(!canAddSource) return;
    streamlabsOBS.v1.Scenes.getActiveScene().then(scene => {
        streamlabsOBS.v1.Sources.createAppSource('3D Image Source', '3d-image-source').then(source => {
            $('#saveSpinner').show();
            controls.setGizmosVisible( false );
            renderScene();
            const imgData = $("#threeCanvas")[0].toDataURL("image/png");
            const currentDate = new Date().toISOString();

            const byteString = atob(imgData.split(',')[1]);
            const mimeString = imgData.split(',')[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            const screenshotFile = new File([ab], `${currentDate}.png`, { type: mimeString });
            streamlabs.userSettings.addAssets([ { name: currentDate, file: screenshotFile } ]).then(result => {
                settings.imageURL = result[currentDate];

                streamlabsOBS.v1.Sources.setAppSourceSettings(source.id, JSON.stringify(settings));
                streamlabsOBS.v1.Scenes.createSceneItem(scene.id, source.id);
                $('#saveSpinner').hide();
                controls.setGizmosVisible( true );
                streamlabsOBS.v1.App.navigate('Editor');
            }).catch(error => {
                console.error('Error uploading asset:', error);
            });
        });
    });
});

function showAlert(element, title, content) {
    $(element)[0].show();
    $(element).find('.alert-title').text(title);
    $(element).find('.alert-content').text(content);
}