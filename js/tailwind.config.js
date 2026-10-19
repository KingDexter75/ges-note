/* EduNeum - Configuration Tailwind unique.
   Le projet avait un fichier *.tailwind.js par page, chacun avec un sous-
   ensemble different de couleurs. Toute page qui oubliait le sien perdait
   bg-accent / text-accent et surtout darkMode:"class" : le mode sombre
   entierement. Ce fichier reunit l'union des couleurs declarees, et les
   pages reconstruites le chargent a la place de leur shim.

   Les pages historiques gardent leur propre fichier : rien n'est casse, et
   la deduplication pourra se faire quand elles seront reprises. */
window.tailwind = window.tailwind || {};
window.tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: '#8b5cf6',
        neubg: '#e0e5ec',
        neudark: '#1a202c',
        danger: '#ef4444',
        warning: '#f59e0b'
      }
    }
  }
};
