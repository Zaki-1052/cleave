HOMER
Software for motif discovery and next-gen sequencing analysis


Installation Guide:
Basic requirements
Homer is computationally intensive collection of programs.  The following are minimum hardware requirements for running promoter analysis (ChIP-Seq in parenthesis).
Unix-style operating system (UNIX/LINUX/Mac/Cygwin)
1 Gb of RAM (4+ Gb)
1 Gb of Hard Drive Space (>10Gb)
While running Homer is designed to be as simple as possible, some basic knowledge of UNIX commands is required.  If you are new to UNIX, try googling "UNIX tutorial" for a more formal introduction.
Required UNIX tools (fairly standard) and recommended NGS software
The following UNIX utilities are required to use HOMER.  You might need to run your UNIX package manager to install them if missing (i.e. "sudo apt-get install wget"):

gcc
g++
make
perl
zip/unzip
gzip/gunzip
wget
The following NGS tools may be required to perform certain analyses and are highly highly recommended:
samtools
R (with Bioconductor packages DESeq2, edgeR)
HOMER no longer requires ghostscript and weblogo
Anaconda/Bioconda
To make things easy, it's recommended to use Anaconda/Bioconda to manage NGS software installations.  Anaconda is a package manager that works well for individual users on max/linux systems. HOMER isn't part of bioconda (partially due to its unorthodox code base/organization, although there is a HOMER package that may or may not work), but regardless, bioconda can help install the required packages and other NGS software even if HOMER itself must be installed manually.

Step 1: Install Anaconda from here (Python3): https://www.continuum.io/downloads
Install Bioconda from instructions here: https://bioconda.github.io/

Step 2: Run the following: conda install wget samtools r-essentials bioconductor-deseq2 bioconductor-edger

Now you're ready to install HOMER with in the install script below.
Linux/UNIX
Homer is a collection of perl and c++ programs designed for execution in a UNIX environment.  Any Unix/Linux or Mac OS X system should have no trouble running Homer.  Homer may also be run on Windows using Cygwin Linux emulation software.  The following basic software must be available on your system.
perl
GNU make utility
GCC C/C++ compiler
wget (useful Unix utility)
Basic utilities such as zip/unzip/gzip/gunzip/cut/tar
Also, it's becoming more and more command for Linux distributions not to ship with basic developer tools (i.e. Ubuntu).  If you run linux and have trouble with the initial setup, try " sudo yum install build-essential" for debian systems (i.e. ubuntu) or 'yum groupinstall "Development Tools"' for redhat (i.e. fedora, centos) systems to install the core developer packages.
Mac OS X
If you are running Mac OS X, you will need to install "Xcode" from Apple if not done so already.  During the installation process, be sure to include "Command Line Tools" when prompted (you can also install these later from the Xcode applications). 

In addition, Mac users should install "wget".  The easiest way to get it is as part of Anaconda (see above). Alternatively you can get it from mac ports (http://wget.darwinports.com/) or at http://www.statusq.org/archives/2008/07/30/1954/.
Windows (Cygwin or VirtualBox)
If you are running Windows, you have two choices.  In the past I would have suggested that you install Cygwin, which is a Linux emulator for Windows.  However, another attractive option is to run Linux as a virtual machine using software such as VirtualBox.  Using software such as VirtualBox you can install a copy of Linux that will run virtually along side Windows, or you can even download an image of a Linux installation.  If you use this option and get a working version of Linux running, you can simply follow the instructions for Linux.  If you still prefer Cygwin, follow these steps for installing Cygwin:
Download the cygwin install program from http://www.cygwin.com/
Run the install program, and when prompted to choose which packages to install, make sure to install the following:
gcc-core (in Devel)
gcc-g++ (in Devel)
make (in Devel)
perl (in Perl)
zip (in Archive)
unzip (in Archive)
wget (in Web)
libncurses (in libs) for samtools
zlib (in libs) for samtools
zlib-devel (in libs) for samtools
mingw64 (in Devel, for pthread support, but doesn't look like it's needed anymore)
Tips for compiling samtools on Cygwin: http://azaleasays.com/2014/09/29/install-samtools-in-cygwin/
Installing the basic HOMER software
HOMER will be installed in the same directory that you place the configureHomer.pl program.  configureHomer.pl will attempt to check for required utilities and alert you to missing programs.
For the latest version of Homer, go to http://homer.salk.edu/homer/.
Download the "configureHomer.pl" script and place it in a directory where you would like homer to be installed (i.e. /home/chucknorris/homer/).
Run the configureHomer.pl script to install homer.
i.e. perl /Users/chucknorris/homer/configureHomer.pl -install
NOTE: Cygwin users may need to rename the files in homer/bin/ to remove the "*.exe" (i.e. "homer.exe" to "homer")
NOTE: If running SunOS or other proprietary UNIX environments, you may need to add the option "-sun" so that "gmake" is used instead of "make".
Add the homer/bin directory to your executable path.  For example, edit your ~/.bash_profile file to include the line:
PATH=$PATH:/Users/chucknorris/homer/bin/
NOTE: Cygwin users may need to use a different format: PATH=/Users/chucknorris/homer/bin:${PATH}
NOTE: Cygwin users, if having trouble, may also need to set windows path variables
NOTE: If using Mac OS X, the ~/.bash_profile file is hidden in Finder.  To edit type "open -a TextEdit ~/.bash_profile" at the command line.
NOTE: If ~/.bash_profile doesn't exist in your mac, create a new file in your home directory, place the PATH=... line in it, and them rename the file using the command-line prompt: "mv newfilename ~/.bash_profile"
Reset your terminal so that the changes to the PATH variable take effect
source ~/.bash_profile
You should now be able to execute programs in the homer/bin directory by just typing their name.
Downloading Homer Packages
The basic Homer installation does not contain any sequence data.  To download sequences for use with homer, use the configureHomer.pl script.  To get a list of available packages:
perl /path-to-homer/configureHomer.pl -list
To install packages, simply use the -install option and the name(s) of the package(s).
perl /path-to-homer/configureHomer.pl -install mouse (to download the mouse promoter set)
perl /path-to-homer/configureHomer.pl -install mm8    (to download the mm8 version of the mouse genome)
perl /path-to-homer/configureHomer.pl -install hg19    (to download the hg19 version of the human genome)

Additional information on configuring or customizing HOMER, go here.
Updating Homer
To update Homer, simply type:
perl /path-to-homer/configureHomer.pl -update

Or, alternatively you can simply force the reinstallation of the basic software...
perl /path-to-homer/configureHomer.pl -install homer

Homer will automatically check which packages are out of date and replace them.

When in trouble, and nothing seems to be working correctly, either:
Delete the homer directory and start over!
Drop me a line (cbenner@ucsd.edu) so I can fix the problem, since there is a good chance it's a problem with the software.
You could try Chuck, but I'm not responsible for any bodily harm.
Installing Old Packages
Older packages can be installed using the configureHomer.pl script using the "-version <version>" option.  For example, to install the v4.8 of HOMER software:
perl configureHomer.pl -install homer -version v4.8
Older versions of software and annotation don't always play nicely with the most up-to-date versions, so be careful.
Notes on installing Homer on shared/multiuser hosts
Unfortunately, HOMER was originally designed to be used by a single user, and hasn't yet been fulling updated to behave perfectly in a multiuser environment.  It is possible to place it on a shared system, but it is recommended you place it in an area that is "group writable" so that users can modify the configuration and load their own organisms. 

It is also possible to run HOMER without allowing individual users write permissions on most HOMER directories, however, directories located in data/genomes/*/preparsed/ should still be group writable since this is where general files for motif analysis will be stored after first use to speed up motif discovery analysis.  As of HOMER v4.4, the software will set permissions on this directory to 775.  Alternatively, users can specify "-preparsedDir <directory> " while running findMotifsGenome.pl to store the files locally.

Installing 3rd Party Software
HOMER no longer requires Ghostscript, Weblogo, or blat.  However, it is highly recommended that samtools and R (along with DESeq2 and edgeR) are installed to take advantage of various NGS analysis routines in HOMER.
Installing samtools
Option 1: Use Anaconda/Bioconda to install samtools - see above. Recommended, particularly if you don't have super-user access. This is also a great way to install R.

Option 2: Depending on your Linux distribution, you can use a standard package manager to install samtools:

(Debian/Ubuntu): sudo apt-get install samtools
(Redhat/CentOS): sudo yum install samtools
Option 3: Download and install samtools directly from the source:
        a.) Download samtools from http://sourceforge.net/projects/samtools/files/
        b.) Unzip and expand the file with "bunzip2 samtools-xyz.tar.bz2" followed by "tar xvf samtools-xyc.tar"
        c.) Change directories into the samtools-xyz folder, and then type "make"
        d.) Add base samtools directory to your executable path
            i.e. edit your ~/.bash_profile file to include:
            PATH=$PATH:/Users/chucknorris/samtools-xyz/
Installing R/Bioconductor and Packages DESeq2 and EdgeR
Option 1: Use Anaconda/Bioconda to install R along with DESeq2 and EdgeR - see above. Recommended, particularly if you don't have super-user access.

Option 2: Depending on your Linux distribution, you can use a standard package manager to install samtools. Generally this option is not recommended because the version of R in the repositories is usually fairly old:

(Debian/Ubuntu): sudo apt-get install r-base r-base-dev
(Redhat/CentOS): sudo yum install r-base r-base-dev

Then run R to install Bioconductor/DESeq2/EdgeR (see below)
Option 3: Download and install R directly from the source: http://cran.cnr.berkeley.edu/
Follow the instructions to install R depending on your system.
If you picked option 2 or 3, now you'll need to run R to install DESeq2 and EdgeR:
Run R by typing "R". You may want to run this as super-user if installing for multiple users (i.e. "sudo R"). At the R prompt (should see a ">"), type the following commands:
> source("https://bioconductor.org/biocLite.R")
> biocLite()
> biocLite("DESeq2")
> biocLite("edgeR")
> q()

If you're having touble here, it might be because your version of R is too old.  Consider using option 3 and get the latest stable version.
Legacy Software for sequence logos (no longer required):
Homer uses WebLogo (Crooks et al.) to visualize motifs graphically.  The WebLogo software uses Ghostscript to generate image files, so both must be installed to successfully create sequence logos.  In addition, BLAT (Kent et al.) is used for certain specialized ChIP-Seq analysis, where it can be used to remove redundant sequences during the analysis (not necessary for 99% of users to install).  samtools is another very useful program that is recommended if doing next-gen sequencing analysis.  New versions of HOMER also make use of specialized routines in the statistical computing environment R and visualization software Circos for Hi-C analysis.
    1.) Download and Install Ghostscript
        a.) Download the appropriate file from http://www.ghostscript.com/download/gsdnld.html (AGPL Ghostscript)
        b.) Unzip and Untar the file (if using the source version)
            tar zxvf ghostcript-xxx.tar.gz
        c.) Change to the base ghostscript directory
            cd ghostscript-xxx
        d.) Run the following commands to install ghost script
            ./configure
            make 
            sudo make install
    (if you do not have root access, you will need to specify a directory that you have access to when you run the configure script) i.e.
        ./configure --prefix=/Users/chucknorris/software/gs
    (you may also want to add the ghostscript bin/ directory to your ~/.bash_profile file
    to make sure the "gs" program is executable)

    2.) Download and Install Weblogo (version 2.8.2 - Does NOT work with version 3.0!!!!)
        a.) Download the program from http://weblogo.berkeley.edu/
        b.) No additional steps needed to compile and install the program, except...
        c.) Need to add the weblogo base directory to your executable path
            i.e. edit your ~/.bash_profile file to include:
            PATH=$PATH:/Users/chucknorris/weblogo/ 

    3.) Download and Install blat (this is used to check for redundant input sequences)
        a.) Download the blat program from http://hgdownload.cse.ucsc.edu/admin/exe/
        You may also want to download the liftOver and bedGraphToBigWig tools
        b.) Unzip the file if needed and compile (if you downloaded the source code)
        c.) You may need to make the command(s) executable. Type: "chmod 755 blat"
        d.) Add base blat directory to your executable path
            i.e. edit your ~/.bash_profile file to include:
            PATH=$PATH:/Users/chucknorris/blat/

    4.) Download and Install samtools (this will help you work with sam and bam formatted files)
        a.) Download samtools from http://sourceforge.net/projects/samtools/files/
        b.) Unzip and expand the file with "bunzip2 samtools-xyz.tar.bz2" followed by "tar xvf samtools-xyc.tar"
        c.) Change directories into the samtools-xyz folder, and then type "make"
        d.) Add base samtools directory to your executable path
            i.e. edit your ~/.bash_profile file to include:
            PATH=$PATH:/Users/chucknorris/samtools-xyz/
The commands gs, seqlogo, blat, and samtools should now work from the command line (if they don't and you think they should, remember to type: source ~/.bash_profile)

Next: Configuring HOMER