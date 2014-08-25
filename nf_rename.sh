#!/bin/bash
argc=$#
i=1
while [ $# -gt 0 ];
do
	argv[$i]=$1
#	echo ${argv[$i]}
	i=$(( $i+1 ))
	shift
done

dir=${argv[1]:-.}
echo Directory : $dir
fn_pattern=${argv[2]:-}
echo FileName Pattern : $fn_pattern
tsfx_format=${argv[3]:-}
echo Time Suffix Format : $tsfx_format

i=4
while [ $i -le $argc ];
do
	events=$events'-e '${argv[$i]}' '
	i=$(( $i+1 ))
done
echo Events : $events

inotifywait -m $events --format '%e %f' $dir |
while read evnt ffn;
do
	fn=${ffn%.*}
	echo FileName : $fn
	fn_extn=${ffn##*.}
	echo FileName Extension : $fn_extn
	if [[ $fn =~ $fn_pattern ]];
	then
		tsfx=`date +$tsfx_format`
		mv $dir$ffn $dir$fn$tsfx.$fn_extn
		echo $dir$ffn rename to $dir$fn$tsfx.$fn_extn
	fi
done

