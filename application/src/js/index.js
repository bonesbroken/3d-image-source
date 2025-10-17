import $ from "jquery";
document.addEventListener('DOMContentLoaded', () => {
    const query = location.search.substr(1);

    if (query && query.includes('settings=')) {
      query.split('&').forEach(part => {
        const item = part.split('=');
        if (item[0] === 'settings' && item[1]) {
            try {
                let settings = JSON.parse(decodeURIComponent(item[1]));
                console.log('Loaded settings from query string:', settings);

                if (settings.imageURL) {
                    const imageContainer = document.getElementById('imageContainer');
                    if (imageContainer) {
                        imageContainer.style.backgroundImage = `url(${settings.imageURL})`;
                        imageContainer.style.backgroundSize = 'contain';
                        imageContainer.style.backgroundRepeat = 'no-repeat';
                        imageContainer.style.backgroundPosition = 'center';
                    }
                }
                
            } catch (err) {
                console.error('Failed to parse settings from query string', err);
            }
        }
      });
    } else {
       
    }
});
