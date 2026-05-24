import dotenv from 'dotenv';
import Parser from 'rss-parser';
import axios from 'axios';
import fs from 'fs/promises';
import * as cheerio from 'cheerio';
import AccountManager from './account-manager.js';

dotenv.config();

class TwitterToPrototurk {
  constructor() {
    // RSS Parser
    this.parser = new Parser({
      customFields: {
        item: ['description', 'pubDate', 'link']
      }
    });

    // Account Manager
    this.accountManager = new AccountManager();

    // Prototurk config
    this.prototurkBaseUrl = 'https://dev.prototurk.com';

    // Son işlenen tweet linklerini sakla (hesap bazında)
    this.lastProcessedFile = 'last_processed.json';
  }

  async getLastProcessedLink(username) {
    try {
      const data = await fs.readFile(this.lastProcessedFile, 'utf-8');
      const processed = JSON.parse(data);
      return processed[username] || null;
    } catch (error) {
      return null;
    }
  }

  async saveLastProcessedLink(username, link) {
    try {
      let processed = {};
      try {
        const data = await fs.readFile(this.lastProcessedFile, 'utf-8');
        processed = JSON.parse(data);
      } catch (error) {
        // Dosya yoksa boş obje
      }
      
      processed[username] = {
        lastLink: link,
        timestamp: new Date().toISOString()
      };
      
      await fs.writeFile(this.lastProcessedFile, JSON.stringify(processed, null, 2));
    } catch (error) {
      console.error('⚠️  Son işlenen link kaydedilemedi:', error.message);
    }
  }

  async fetchRSS(username) {
    // Sadece çalışan RSS kaynakları (2025-2026 güncel)
    const rssInstances = [
      { url: `https://nitter.perennialte.ch/${username}/rss`, base: 'https://nitter.perennialte.ch', name: 'nitter.perennialte.ch' },
      { url: `https://nitter.privacydev.net/${username}/rss`, base: 'https://nitter.privacydev.net', name: 'nitter.privacydev.net' },
      { url: `https://nitter.poast.org/${username}/rss`, base: 'https://nitter.poast.org', name: 'nitter.poast.org' },
      { url: `https://xcancel.com/${username}/rss`, base: 'https://xcancel.com', name: 'xcancel.com' },
      { url: `https://nitter.net/${username}/rss`, base: 'https://nitter.net', name: 'nitter.net' }
    ];
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };

    for (const instance of rssInstances) {
      try {
        console.log(`📡 RSS deneniyor: ${instance.name}...`);
        
        // Önce axios ile çekelim (headers kontrolü için)
        const response = await axios.get(instance.url, {
          headers: headers,
          timeout: 15000,
          validateStatus: (status) => status === 200
        });

        if (response.data) {
          // Whitelist uyarısı kontrolü (ham veri üzerinde)
          if (response.data.includes('not yet whitelisted')) {
            console.log(`⚠️  ${instance.name} whitelist uyarısı veriyor, geçiliyor...`);
            continue;
          }

          const feed = await this.parser.parseString(response.data);
          
          if (feed.items && feed.items.length > 0) {
            // Item'lar içinde de kontrol et (bazıları tek tek koyuyor)
            const realItems = feed.items.filter(item => {
              const content = (item.content || item.description || item.title || '').toLowerCase();
              return !content.includes('not yet whitelisted') && !content.includes('rss reader not yet');
            });

            if (realItems.length > 0) {
              console.log(`✅ ${realItems.length} tweet bulundu (${instance.name})`);
              return { items: realItems, baseUrl: instance.base };
            } else {
              console.log(`⚠️  ${instance.name} sadece whitelist mesajları içeriyor, geçiliyor...`);
            }
          }
        }
      } catch (error) {
        console.log(`⚠️  ${instance.name} hatası: ${error.message}`);
        continue;
      }
    }
    
    return { items: [], baseUrl: null };
  }

  async postToPrototurk(account, content, images = []) {
    try {
      console.log(`📤 ${account.twitterUsername} için Prototurk'e gönderiliyor...`);
      
      const prototurkHeaders = {
        'Content-Type': 'application/json',
        'Cookie': `pt_session=${account.prototurkSession}; pt_csrf=${account.prototurkCsrf}`,
        'x-csrf-token': account.prototurkCsrf,
        'Origin': this.prototurkBaseUrl,
        'Referer': `${this.prototurkBaseUrl}/${account.prototurkUsername}`,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0'
      };
      
      // contentJson oluştur
      const contentJsonParts = [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: content
            }
          ]
        }
      ];
      
      // Görselleri ekle
      if (images && images.length > 0) {
        console.log(`🖼️  ${images.length} görsel ekleniyor...`);
        
        for (const imageUrl of images) {
          const imageData = await this.downloadImage(imageUrl);
          if (imageData) {
            const uploadedUrl = await this.uploadImageToPrototurk(account, imageData.buffer, imageData.contentType);
            if (uploadedUrl) {
              contentJsonParts.push({
                type: "image",
                attrs: {
                  src: uploadedUrl,
                  alt: "Tweet görseli",
                  title: null
                }
              });
            }
          }
        }
      }
      
      const payload = {
        content: content,
        contentJson: {
          type: "doc",
          content: contentJsonParts
        },
        category: "genel",
        status: "published"
      };
      
      const response = await axios.post(
        `${this.prototurkBaseUrl}/api/posts`,
        payload,
        { headers: prototurkHeaders }
      );

      console.log(`✅ ${account.twitterUsername} için başarıyla gönderildi:`, response.data);
      return response.data;
    } catch (error) {
      console.error(`❌ ${account.twitterUsername} için Prototurk API hatası:`, error.response?.data || error.message);
      throw error;
    }
  }

  extractImagesFromContent(htmlContent, baseUrl = 'https://nitter.net') {
    try {
      const $ = cheerio.load(htmlContent);
      const imageUrls = [];
      
      $('img').each((index, img) => {
        const src = $(img).attr('src');
        if (src && !src.includes('emoji') && !src.includes('icon')) {
          // Nitter'daki görselleri tam URL'e çevir
          const fullUrl = src.startsWith('http') ? src : `${baseUrl}${src}`;
          imageUrls.push(fullUrl);
        }
      });
      
      return imageUrls;
    } catch (error) {
      console.error('⚠️  Görsel çıkarma hatası:', error.message);
      return [];
    }
  }

  async downloadImage(url) {
    try {
      let targetUrls = [url];
      
      // Nitter URL'ini orijinal Twitter URL'ine çevirmeye çalış
      if (url.includes('/pic/')) {
        try {
          const encodedPath = url.split('/pic/')[1];
          const decodedPath = decodeURIComponent(encodedPath);
          
          if (decodedPath.startsWith('media/')) {
            // Normal tweet görseli: media/xxxx.jpg -> pbs.twimg.com/media/xxxx.jpg
            targetUrls.unshift(`https://pbs.twimg.com/${decodedPath}`);
          } else if (decodedPath.startsWith('card_img/')) {
            // Card görseli: card_img/xxxx/yyyy?format=jpg -> pbs.twimg.com/card_img/xxxx/yyyy?format=jpg
            targetUrls.unshift(`https://pbs.twimg.com/${decodedPath}`);
          }
        } catch (e) {
          // Çözme hatası olursa orijinal URL ile devam et
        }
      }

      // Nitter instance'ları (fallback için)
      const downloadInstances = [
        'nitter.projectsegfau.lt',
        'nitter.perennialte.ch',
        'nitter.privacydev.net',
        'nitter.poast.org',
        'xcancel.com'
      ];

      // Eğer URL bir nitter instance'ı içeriyorsa ve henüz eklenmemişse, diğerlerini de ekle
      const currentInstance = downloadInstances.find(inst => url.includes(inst));
      if (currentInstance) {
        downloadInstances.forEach(inst => {
          const alternativeUrl = url.replace(currentInstance, inst);
          if (!targetUrls.includes(alternativeUrl)) {
            targetUrls.push(alternativeUrl);
          }
        });
      }

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://twitter.com/'
      };

      for (const targetUrl of targetUrls) {
        try {
          const domain = targetUrl.split('/')[2];
          console.log(`   📥 Görsel indiriliyor: ${domain}`);
          
          const response = await axios.get(targetUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: headers,
            maxRedirects: 5
          });
          
          if (response.data && response.data.length > 500) { // Çok küçükse (hata sayfası vs) geç
            console.log(`   ✅ Görsel indirildi (${response.data.length} bytes, ${response.headers['content-type']})`);
            return {
              buffer: response.data,
              contentType: response.headers['content-type'] || 'image/jpeg'
            };
          }
        } catch (error) {
          // Sessizce bir sonrakini dene
          continue;
        }
      }
    } catch (error) {
      console.error('⚠️  Görsel indirme hatası:', url, error.message);
    }
    
    return null;
  }

  async updatePrototurkProfile(account, profileData) {
    try {
      console.log(`\n👤 ${account.twitterUsername} için profil güncelleniyor...`);
      
      // Önce profil fotoğrafını yükle (varsa)
      let avatarKey = null;
      if (profileData.avatar) {
        avatarKey = await this.uploadPrototurkAvatar(account, profileData.avatar);
      }
      
      // Profil bilgilerini hazırla
      const payload = {
        name: profileData.displayName,
        about: profileData.bio || '',
        websiteUrl: profileData.website || ''
      };
      
      // Avatar key varsa ekle
      if (avatarKey) {
        payload.avatar = avatarKey;
      }
      
      console.log(`   İsim: ${profileData.displayName}`);
      console.log(`   Bio: ${profileData.bio?.substring(0, 50) || 'Yok'}${profileData.bio?.length > 50 ? '...' : ''}`);
      console.log(`   Website: ${profileData.website || 'Yok'}`);
      if (avatarKey) {
        console.log(`   Avatar Key: ${avatarKey}`);
      }
      
      const response = await axios.patch(
        `${this.prototurkBaseUrl}/api/account/profile`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `pt_session=${account.prototurkSession}; pt_csrf=${account.prototurkCsrf}`,
            'x-csrf-token': account.prototurkCsrf,
            'Origin': this.prototurkBaseUrl,
            'Referer': `${this.prototurkBaseUrl}/settings`,
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0'
          },
          timeout: 10000
        }
      );

      console.log(`   ✅ Profil güncellendi`);
      
      return response.data;
    } catch (error) {
      console.error(`❌ Profil güncelleme hatası:`, error.response?.data || error.message);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
      }
      return null;
    }
  }

  async uploadPrototurkAvatar(account, avatarUrl) {
    try {
      console.log(`🖼️  Profil fotoğrafı yükleniyor: ${avatarUrl}`);
      
      // Avatar'ı indir
      const imageData = await this.downloadImage(avatarUrl);
      if (!imageData) {
        console.log(`⚠️  Avatar indirilemedi`);
        return null;
      }
      
      // Prototurk'e yükle
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      
      const ext = imageData.contentType.includes('png') ? 'png' : 'jpg';
      form.append('file', imageData.buffer, {
        filename: `avatar.${ext}`,
        contentType: imageData.contentType
      });
      
      console.log(`   📤 Prototurk'e yükleniyor...`);
      
      const uploadResponse = await axios.post(
        `${this.prototurkBaseUrl}/api/uploads`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            'Cookie': `pt_session=${account.prototurkSession}; pt_csrf=${account.prototurkCsrf}`,
            'x-csrf-token': account.prototurkCsrf,
            'Origin': this.prototurkBaseUrl,
            'Referer': `${this.prototurkBaseUrl}/settings`,
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0'
          },
          timeout: 30000
        }
      );
      
      console.log(`   ✅ Profil fotoğrafı yüklendi`);
      
      // Avatar key'ini döndür
      if (uploadResponse.data && uploadResponse.data.key) {
        return uploadResponse.data.key;
      } else {
        console.log(`   ⚠️  Avatar key bulunamadı`);
        return null;
      }
      
    } catch (error) {
      console.error(`❌ Avatar yükleme hatası:`, error.response?.data || error.message);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Headers:`, error.response.headers);
      }
      return null;
    }
  }

  async getTwitterProfileInfo(username) {
    // Sadece çalışan instance'lar
    const instances = [
      { base: 'https://nitter.perennialte.ch', name: 'nitter.perennialte.ch' },
      { base: 'https://xcancel.com', name: 'xcancel.com' },
      { base: 'https://nitter.projectsegfau.lt', name: 'nitter.projectsegfau.lt' }
    ];
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    };
    
    for (const instance of instances) {
      try {
        console.log(`📡 Profil bilgisi deneniyor: ${instance.name}...`);
        
        // Önce RSS'den deneyelim (daha hızlı)
        const rssUrl = `${instance.base}/${username}/rss`;
        const rssResponse = await axios.get(rssUrl, {
          headers: {
            ...headers,
            'Accept': 'application/rss+xml, application/xml, text/xml, */*'
          },
          timeout: 15000
        });

        if (rssResponse.data) {
          const feed = await this.parser.parseString(rssResponse.data);
          
          if (feed && feed.title) {
            // RSS'den profil bilgilerini çıkar
            let displayName = username;
            if (feed.title.includes(' / @')) {
              displayName = feed.title.split(' / @')[0].trim();
            }
            
            // Avatar URL
            let avatarUrl = null;
            if (feed.image && feed.image.url) {
              avatarUrl = feed.image.url;
              // Nitter proxy linkini çöz
              if (avatarUrl.includes('/pic/')) {
                const encodedPath = avatarUrl.split('/pic/')[1];
                const decodedPath = decodeURIComponent(encodedPath);
                // pbs.twimg.com/profile_images/xxxx/yyyy_normal.jpg -> original
                avatarUrl = decodedPath.startsWith('http') ? decodedPath : `https://${decodedPath}`;
              }
              
              // Orijinal Twitter avatar ise yüksek kaliteye çek (400x400)
              if (avatarUrl.includes('pbs.twimg.com/profile_images')) {
                avatarUrl = avatarUrl.replace('_normal.', '_400x400.').replace('_bigger.', '_400x400.');
              }
            }
            
            // Bio için profil sayfasını çek (RSS'de bio yok)
            let bio = '';
            try {
              const profileResponse = await axios.get(`${instance.base}/${username}`, {
                headers: headers,
                timeout: 15000
              });
              
              const $ = cheerio.load(profileResponse.data);
              bio = $('.profile-bio p').text().trim() ||
                    $('div.profile-bio').text().trim() ||
                    $('.bio').text().trim();
            } catch (e) {
              // Bio alınamazsa sorun değil
            }

            console.log(`✅ Profil bilgisi alındı (${instance.name})`);
            return {
              displayName,
              avatar: avatarUrl,
              bio: bio || `resmi ProtoTürk ${username} hesabı`,
              website: `https://twitter.com/${username}`
            };
          }
        }
      } catch (error) {
        console.log(`⚠️  ${instance.name} profil hatası: ${error.message}`);
        continue;
      }
    }
    
    return {
      displayName: username,
      avatar: null,
      bio: `resmi ProtoTürk ${username} hesabı`,
      website: `https://twitter.com/${username}`
    };
  }

  async uploadImageToPrototurk(account, imageBuffer, contentType) {
    try {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      
      // Dosya uzantısını content-type'dan belirle
      const ext = contentType.includes('png') ? 'png' : 'jpg';
      form.append('file', imageBuffer, {
        filename: `image.${ext}`,
        contentType: contentType
      });
      
      console.log(`   📤 Prototurk'e yükleniyor... (${imageBuffer.length} bytes)`);
      
      const response = await axios.post(
        `${this.prototurkBaseUrl}/api/uploads`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            'Cookie': `pt_session=${account.prototurkSession}; pt_csrf=${account.prototurkCsrf}`,
            'x-csrf-token': account.prototurkCsrf,
            'Origin': this.prototurkBaseUrl,
            'Referer': `${this.prototurkBaseUrl}/`,
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0'
          },
          timeout: 30000
        }
      );
      
      if (response.data && (response.data.url || response.data.path)) {
        const uploadedUrl = response.data.url || response.data.path;
        console.log(`   ✅ Görsel yüklendi: ${uploadedUrl}`);
        return uploadedUrl;
      } else {
        console.log(`   ⚠️  Görsel yüklendi ama URL alınamadı:`, response.data);
        return null;
      }
      
    } catch (error) {
      console.error('⚠️  Görsel yükleme hatası:', error.response?.data || error.message);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
      }
      return null;
    }
  }

  cleanTweetContent(htmlContent) {
    // HTML etiketlerini temizle
    let content = htmlContent
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .trim();
    
    return content;
  }

  getTweetId(link) {
    if (!link) return null;
    // URL: .../status/123456789#m -> 123456789
    const match = link.match(/\/status\/(\d+)/);
    return match ? match[1] : link;
  }

  async processAccountTweets(account) {
    const username = account.twitterUsername;
    const { items, baseUrl } = await this.fetchRSS(username);

    if (items.length === 0) {
      console.log(`ℹ️  ${username}: RSS'de içerik bulunamadı.`);
      return;
    }

    const lastProcessedData = await this.getLastProcessedLink(username);
    const lastProcessedLink = lastProcessedData?.lastLink;
    const lastProcessedId = this.getTweetId(lastProcessedLink);
    
    const newItems = [];

    // Yeni tweet'leri bul
    for (const item of items) {
      const currentId = this.getTweetId(item.link);
      if (lastProcessedId && currentId === lastProcessedId) {
        break; // Daha önce işlenmiş tweet'e ulaştık
      }
      newItems.push(item);
    }

    if (newItems.length === 0) {
      console.log(`ℹ️  ${username}: Yeni tweet bulunamadı.`);
      return;
    }

    console.log(`🔄 ${username}: ${newItems.length} yeni tweet bulundu, işleniyor...`);

    // Eski -> yeni sırasında işle
    const sortedItems = newItems.reverse();

    // Tweet'leri paralel gönder (max 5 aynı anda)
    const batchSize = 5;
    
    for (let i = 0; i < sortedItems.length; i += batchSize) {
      const batch = sortedItems.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (item) => {
          try {
            const content = this.cleanTweetContent(item.contentSnippet || item.description || item.title);
            const images = this.extractImagesFromContent(item.content || item.description || '', baseUrl);
            
            console.log(`\n📝 ${username}: ${content.substring(0, 50)}...`);
            console.log(`🔗 Link: ${item.link}`);
            if (images.length > 0) {
              console.log(`🖼️  ${images.length} görsel bulundu`);
            }
            
            await this.postToPrototurk(account, content, images);
            await this.saveLastProcessedLink(username, item.link);
            
          } catch (error) {
            console.error(`❌ ${username}: Tweet işlenirken hata: ${item.link}`);
          }
        })
      );
      
      // Batch'ler arası kısa bekleme
      if (i + batchSize < sortedItems.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async likePost(account, postId) {
    try {
      await axios.post(
        `${this.prototurkBaseUrl}/api/posts/${postId}/like`,
        {},
        {
          headers: {
            'Cookie': `pt_session=${account.prototurkSession}; pt_csrf=${account.prototurkCsrf}`,
            'x-csrf-token': account.prototurkCsrf,
            'Origin': this.prototurkBaseUrl,
            'Referer': `${this.prototurkBaseUrl}/`,
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0'
          }
        }
      );
      return true;
    } catch (error) {
      console.log(`      ❌ Beğeni hatası (@${account.twitterUsername}):`, error.response?.data?.error || error.message);
      return false;
    }
  }

  async bookmarkPost(account, postId) {
    try {
      await axios.post(
        `${this.prototurkBaseUrl}/api/posts/${postId}/bookmark`,
        {},
        {
          headers: {
            'Cookie': `pt_session=${account.prototurkSession}; pt_csrf=${account.prototurkCsrf}`,
            'x-csrf-token': account.prototurkCsrf,
            'Origin': this.prototurkBaseUrl,
            'Referer': `${this.prototurkBaseUrl}/`,
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0'
          }
        }
      );
      return true;
    } catch (error) {
      console.log(`      ❌ Kaydetme hatası (@${account.twitterUsername}):`, error.response?.data?.error || error.message);
      return false;
    }
  }

  async commentOnPost(account, postId, authorUsername) {
    const comments = [
      "Harika bir paylaşım olmuş, teşekkürler!",
      "Çok faydalı bilgiler, elinize sağlık.",
      "Bunu öğrendiğim iyi oldu, sağ olun.",
      "Gerçekten çok ilginç bir konu.",
      "Katılıyorum, çok doğru bir tespit.",
      "Vay be, bunu bilmiyordum.",
      "Güzel içerik, takibe aldım.",
      "Emeğinize sağlık, devamını bekliyoruz.",
      "Çok açıklayıcı olmuş, teşekkürler.",
      "Harikasınız, başarılar dilerim.",
      "Tam da bunu arıyordum, süper!",
      "Çok kaliteli bir içerik olmuş.",
      "Teşekkürler, çok yardımcı oldu.",
      "Kesinlikle öyle, çok iyi.",
      "Bilgilendirme için teşekkürler.",
      "Süper paylaşım, ellerinize sağlık.",
      "Bunu mutlaka deneyeceğim.",
      "Daha fazla böyle içerik gelmeli.",
      "Çok yerinde bir paylaşım.",
      "İlgiyle takip ediyorum, harika.",
      "Çok başarılı, tebrikler.",
      "Mükemmel bir anlatım olmuş.",
      "İçerik kalitesi çok yüksek.",
      "Elinize sağlık kanka, çok iyi.",
      "Güzel noktaya değinmişsiniz.",
      "Bilmiyordum, sayenizde öğrendim.",
      "Süper, çok teşekkürler.",
      "Efsane olmuş, devamı gelsin.",
      "Çok keyifli bir yazı olmuş.",
      "Yararlı bir paylaşım, sağ olun."
    ];

    const randomComment = comments[Math.floor(Math.random() * comments.length)];

    try {
      await axios.post(
        `${this.prototurkBaseUrl}/api/posts/${postId}/comments`,
        {
          text: randomComment
        },
        {
          headers: {
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
            'Cookie': `pt_session=${account.prototurkSession}; pt_csrf=${account.prototurkCsrf}`,
            'x-csrf-token': account.prototurkCsrf,
            'Origin': this.prototurkBaseUrl,
            'Referer': `${this.prototurkBaseUrl}/${authorUsername}/post/${postId}`,
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0',
            'DNT': '1',
            'Sec-GPC': '1'
          }
        }
      );
      return { success: true, comment: randomComment };
    } catch (error) {
      console.log(`      ❌ Yorum hatası (@${account.twitterUsername}):`, error.response?.data?.error || error.response?.data?.message || error.message);
      return { success: false };
    }
  }

  async replyToComment(account, postId, commentId, authorUsername) {
    const replies = [
      "Kesinlikle katılıyorum.",
      "Ben de aynı fikirdeyim.",
      "Çok haklısın kanka.",
      "Aynen öyle.",
      "Bence de çok doğru.",
      "Katılmamak elde değil.",
      "Doğru söze ne denir.",
      "Kesinlikle!",
      "Ben de öyle düşünüyorum.",
      "Çok yerinde bir yorum olmuş."
    ];

    const randomReply = replies[Math.floor(Math.random() * replies.length)];

    try {
      await axios.post(
        `${this.prototurkBaseUrl}/api/posts/${postId}/comments`,
        {
          text: randomReply,
          parent_id: commentId
        },
        {
          headers: {
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/json',
            'Cookie': `pt_session=${account.prototurkSession}; pt_csrf=${account.prototurkCsrf}`,
            'x-csrf-token': account.prototurkCsrf,
            'Origin': this.prototurkBaseUrl,
            'Referer': `${this.prototurkBaseUrl}/${authorUsername}/post/${postId}`,
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0',
            'DNT': '1',
            'Sec-GPC': '1'
          }
        }
      );
      return { success: true, reply: randomReply };
    } catch (error) {
      console.log(`      ❌ Yanıt hatası (@${account.twitterUsername}):`, error.response?.data?.error || error.response?.data?.message || error.message);
      return { success: false };
    }
  }

  async performRandomInteractions() {
    try {
      const accounts = await this.accountManager.getActiveAccounts();
      if (accounts.length === 0) return;

      console.log('\n🌟 Rastgele etkileşimler başlatılıyor...');

      // Feed'den son postları çek (Tarayıcı gibi davran)
      const feedResponse = await axios.get(`${this.prototurkBaseUrl}/api/feed?tab=new&limit=20`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0',
          'Origin': this.prototurkBaseUrl,
          'Referer': `${this.prototurkBaseUrl}/`
        }
      });
      
      const posts = feedResponse.data.items || [];
      console.log(`   🔎 Akışta ${posts.length} post bulundu.`);

      if (posts.length === 0) return;

      // Hesapları karıştır
      const shuffledAccounts = [...accounts].sort(() => 0.5 - Math.random()).slice(0, 40); // Her turda max 40 hesap etkileşim yapsın (daha fazla hesap)

      for (const account of shuffledAccounts) {
        // Her hesap için rastgele 5-10 post seç (daha fazla post)
        const targetCount = Math.floor(Math.random() * 6) + 5;
        const shuffledPosts = [...posts].sort(() => 0.5 - Math.random()).slice(0, targetCount);

        for (const post of shuffledPosts) {
          // Kendi postunu veya çok eski postu beğenme
          if (post.author?.username === account.prototurkUsername) continue;

          // %80 ihtimalle beğen (çok yüksek etkileşim)
          if (Math.random() < 0.8) {
            const success = await this.likePost(account, post.id);
            if (success) console.log(`   ❤️  @${account.twitterUsername} -> @${post.author?.username} postunu beğendi`);
          }

          // %40 ihtimalle kaydet
          if (Math.random() < 0.4) {
            const success = await this.bookmarkPost(account, post.id);
            if (success) console.log(`   🔖 @${account.twitterUsername} -> @${post.author?.username} postunu kaydetti`);
          }

          // %20 ihtimalle takip et
          if (Math.random() < 0.2) {
            const res = await this.accountManager.followUser(post.author?.username, account);
            if (res.success) {
              console.log(`   👤 @${account.twitterUsername} -> @${post.author?.username} kullanıcısını takip etti`);
            }
          }

          // %10 ihtimalle yorum yap (daha nadir ve değerli)
          if (Math.random() < 0.1) {
            const res = await this.commentOnPost(account, post.id, post.author?.username);
            if (res.success) {
              console.log(`   💬 @${account.twitterUsername} -> @${post.author?.username} postuna yorum yaptı: "${res.comment}"`);
            }
          }

          // %5 ihtimalle var olan bir yoruma yanıt ver
          if (Math.random() < 0.05) {
            try {
              // Postun yorumlarını çek
              const postResponse = await axios.get(`${this.prototurkBaseUrl}/api/posts/${post.id}/comments`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0' }
              });
              const comments = postResponse.data.items || [];
              if (comments.length > 0) {
                // Kendi yorumu olmayan rastgele bir yorum seç
                const targetComment = comments
                  .filter(c => c.author?.username !== account.prototurkUsername)
                  .sort(() => 0.5 - Math.random())[0];
                
                if (targetComment) {
                  const replyRes = await this.replyToComment(account, post.id, targetComment.id, post.author?.username);
                  if (replyRes.success) {
                    console.log(`   🗨️  @${account.twitterUsername} -> @${targetComment.author?.username} kullanıcısının yorumuna yanıt verdi: "${replyRes.reply}"`);
                  }
                }
              }
            } catch (e) {
              // Yorum çekilemediyse geç
            }
          }

          // Çok hızlı gitmesin (API limitleri için)

          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    } catch (error) {
      console.error('⚠️  Etkileşim hatası:', error.message);
    }
  }

  async processNewTweets() {
    const accounts = await this.accountManager.getActiveAccounts();

    if (accounts.length === 0) {
      console.log('⚠️  Aktif hesap bulunamadı!');
      return;
    }

    console.log(`\n📊 [POSTING] ${accounts.length} hesap işlenecek...\n`);

    // Paralel işleme için Promise.all kullan (max 10 hesap aynı anda)
    const batchSize = 10;

    for (let i = 0; i < accounts.length; i += batchSize) {
      const batch = accounts.slice(i, i + batchSize);
      console.log(`\n🔄 [POSTING] Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} hesap paralel işleniyor...\n`);

      await Promise.all(
        batch.map(async (account) => {
          try {
            await this.processAccountTweets(account);
          } catch (error) {
            console.error(`❌ ${account.twitterUsername} işlenirken hata:`, error.message);
          }
        })
      );

      // Batch'ler arası kısa bekleme
      if (i + batchSize < accounts.length) {
        console.log('\n⏳ [POSTING] Sonraki batch için 3 saniye bekleniyor...\n');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log('\n✅ [POSTING] Tüm hesaplar işlendi!\n');
  }

  async processInteractions() {
    console.log('\n🌟 [INTERACTION] Etkileşim turu başlatılıyor...');
    
    // Rastgele etkileşimleri tetikle
    await this.performRandomInteractions();
    
    // Otomatik botlar arası takipleşme
    await this.autoMutualFollow();
    
    console.log('\n✅ [INTERACTION] Etkileşim turu tamamlandı!\n');
  }

  async autoMutualFollow() {
    try {
      const activeAccounts = await this.accountManager.getActiveAccounts();
      if (activeAccounts.length < 2) return;

      console.log(`\n👥 Botlar arası otomatik takipleşme kontrol ediliyor...`);

      // Her turda hesapların %10'u rastgele 1-2 kişiyi takip etsin (dozunda olsun)
      const luckyAccounts = activeAccounts
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.max(1, Math.floor(activeAccounts.length * 0.1)));

      for (const account of luckyAccounts) {
        const username = account.prototurkUsername || account.twitterUsername;

        // Takip edilecek kişi sayısı (1-2)
        const followCount = Math.floor(Math.random() * 2) + 1;

        const others = activeAccounts
          .filter(a => (a.prototurkUsername || a.twitterUsername) !== username)
          .sort(() => Math.random() - 0.5)
          .slice(0, followCount);

        for (const target of others) {
          const targetUsername = target.prototurkUsername || target.twitterUsername;
          const res = await this.accountManager.followUser(targetUsername, account);
          if (res.success) {
            console.log(`   👤 @${username} -> @${targetUsername} kullanıcısını takip etti`);
          }
          // Kısa bekleme
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      console.error('⚠️  Otomatik takipleşme hatası:', error.message);
    }
  }

  async start() {

    console.log('🚀 Twitter (RSS) -> Prototurk çoklu hesap aktarımı başlatıldı\n');
    
    // Profil senkronizasyonunu atla - Nitter instance'ları stabil değil
    console.log('ℹ️  Profil senkronizasyonu devre dışı (Nitter instance sorunları)\n');
    console.log('💡 Profilleri manuel olarak güncellemek için: bun run sync\n');
    
    console.log('🔥 Kesintisiz döngü başlatıldı. Postlar ve etkileşimler paralel çalışıyor!\n');

    // Sonsuz döngü (while true)
    while (true) {
      try {
        console.log(`\n⏰ ${new Date().toLocaleString('tr-TR')} - Yeni tur başlatılıyor...`);
        
        // Post atma ve etkileşimleri AYNI ANDA başlat
        await Promise.all([
          this.processNewTweets(),
          this.processInteractions()
        ]);
        
        // Bir tur bittikten sonra çok kısa bir nefes al (sistem kaynakları için 1 saniye)
        console.log('\n✨ Tur tamamlandı. Hiç beklemeden yeni tura geçiliyor...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('❌ Ana döngüde hata:', error.message);
        // Hata durumunda 5 saniye bekle ki sürekli hata verip sistemi kitlemesin
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async syncAllProfiles() {
    const accounts = await this.accountManager.getActiveAccounts();
    
    if (accounts.length === 0) {
      return;
    }

    console.log(`\n🎨 ${accounts.length} hesabın profili senkronize ediliyor...\n`);

    // Paralel profil senkronizasyonu (max 10 aynı anda)
    const batchSize = 10;
    
    for (let i = 0; i < accounts.length; i += batchSize) {
      const batch = accounts.slice(i, i + batchSize);
      console.log(`🔄 Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} profil paralel güncelleniyor...\n`);
      
      await Promise.all(
        batch.map(async (account) => {
          try {
            await this.syncProfile(account);
          } catch (error) {
            console.error(`❌ ${account.twitterUsername} profil senkronizasyonu hatası:`, error.message);
          }
        })
      );
      
      // Batch'ler arası kısa bekleme
      if (i + batchSize < accounts.length) {
        console.log('\n⏳ Sonraki batch için 2 saniye bekleniyor...\n');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('\n✅ Profil senkronizasyonu tamamlandı\n');
  }

  async syncProfile(account) {
    console.log(`🔄 ${account.twitterUsername} profili güncelleniyor...`);
    
    // Twitter'dan profil bilgilerini çek
    const profileInfo = await this.getTwitterProfileInfo(account.twitterUsername);
    
    if (!profileInfo) {
      console.log(`⚠️  ${account.twitterUsername} profil bilgisi alınamadı`);
      return;
    }
    
    // Prototurk profilini güncelle
    await this.updatePrototurkProfile(account, profileInfo);
  }

  // Yeni hesap ekleme fonksiyonu
  async addAccount(twitterUsername) {
    return await this.accountManager.addTwitterAccount(twitterUsername, true);
  }
}

// Başlat
if (import.meta.main) {
  const bot = new TwitterToPrototurk();
  bot.start().catch(console.error);
}

export default TwitterToPrototurk;
